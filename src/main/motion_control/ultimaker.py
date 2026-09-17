import re
import time
import serial
import logging

from ..serial_ports import SerialDevice, get_port


logger = logging.getLogger(__name__)


# Establishes a serial.Serial connection and returns it
def _create_connection() -> serial.Serial:
    BAUD = 250000
    port = get_port(SerialDevice.ULTIMAKER)

    printer = serial.Serial(port, BAUD, timeout=2)

    time.sleep(2) # give controller time after opening connection
    printer.reset_input_buffer() # remove startup messages

    return printer


class UltimakerMotion:
    """
    Class for controlling and abstracting movement of the Ultimaker 2+.
    Public Methods:
    - `is_reachable() -> bool`;                     checks whether the printer responds
    - `home() -> None`;                             homes all axes
    - `get_position() -> [float, float, float]`;    returns current (x,y,z) position
    - `move_to(x,y,z) -> None`;                     moves head safely to target position
    - `jog(dx,dy,dz) -> None`;                      short relative move without the lift to SAFE_Z

    Safety:
    - Validates all target coordinates against the configured X, Y, Z ranges (Y and Z
      extended to the homed position, where their travel ends)
    - Never commands a Z position below MIN_SAFE_Z (the glass; the tip touches the sheet there)
    - Performs XY movement only at or above SAFE_Z
    - Speeds: uses XY_SPEED mm/min for horizontal movement, Z_SPEED_FAST mm/min for Z movement above SLOW_Z_THRESHOLD,
      Z_SPEED_SLOW mm/min near the PCB below SLOW_Z_THRESHOLD
    """
    X_RANGE = (0.0, 223.0)
    Y_RANGE = (0.0, 223.0)
    Z_RANGE = (0.0, 205.0)

    XY_SPEED = 3000      # mm/min
    Z_SPEED_FAST = 1000  # mm/min
    Z_SPEED_SLOW = 300   # mm/min

    SAFE_Z = 50.0     # safe height for XY movement
    MIN_SAFE_Z = 0.0  # the tip must reach the glass (the bed sheet lies on it); the endstop is the floor
    SLOW_Z_THRESHOLD = 30.0  # slow down below this height
    MAX_JOG_MM = 10.0  # the longest step a jog takes

    def __init__(self):
        self.printer = _create_connection()
        if self.is_reachable():
            logger.info("Ultimaker connected and reachable")
        else:
            logger.warning("Ultimaker connection failed")


    # private method to send g-codes to ultimaker
    # safety: timeout of 60sec by default, raises errors received from device
    def _send_gcode(self, command: str, timeout: float = 60):
        command = command.strip()
        if not command:
            raise ValueError("G-code command must not be empty.")

        self.printer.write((command + "\n").encode())
        self.printer.flush()

        responses: list[str] = []
        deadline = time.monotonic() + timeout

        while time.monotonic() < deadline:
            return_value = self.printer.readline()
            if not return_value:
                continue

            response = return_value.decode("ascii", errors="replace").strip()

            if not response:
                continue

            responses.append(response)
            if response.lower().startswith("ok"):
                return responses

            if response.lower().startswith("error"):
                raise RuntimeError(
                    f"Printer returned an error for '{command}': {response}"
                )

        raise TimeoutError(
            f"Printer did not acknowledge '{command}' within {timeout} seconds."
        )


    # reachability test with "M115" = requesting firmware information
    def is_reachable(self) -> bool:
        try:
            responses = self._send_gcode("M115", timeout=2)
            return any("FIRMWARE_NAME" in line for line in responses)
        except (TimeoutError, RuntimeError, serial.SerialException):
            return False


    # Home all axes for calibration and waits until action completed.
    # Y and Z home at their far ends, a little beyond the print volume the ranges
    # come from; the homed position is where their travel ends.
    def home(self) -> None:
        self._send_gcode("G28")
        self._send_gcode("M400")
        _, y, z = self.get_position()
        self.Y_RANGE = (self.Y_RANGE[0], max(self.Y_RANGE[1], y))
        self.Z_RANGE = (self.Z_RANGE[0], max(self.Z_RANGE[1], z))


    # Returns the current position as (x,y,z) all being floats
    def get_position(self) -> tuple[float, float, float]:
        responses = self._send_gcode("M114")

        for response in responses:
            match = re.search(
                r"X:\s*(-?[\d.]+)\s*Y:\s*(-?[\d.]+)\s*Z:\s*(-?[\d.]+)",
                response,
            )

            if match:
                x, y, z = map(float, match.groups())
                return x, y, z

        raise RuntimeError(
            f"Could not parse position from printer response: {responses}"
        )


    # Moves head to (x,y,z), safety mechanisms:
    # - Validates axe ranges
    # - Moves (X,Y) only at or above Z-level SAFE_Z
    # - Never moves the probe below MIN_SAFE_Z
    def move_to(self, x: float, y: float, z: float) -> None:
        self._validate_position(x, y, z)

        current_x, current_y, current_z = self.get_position()

        # Lift probe to safe height before XY movement
        if current_z < self.SAFE_Z:
            self._move_z(self.SAFE_Z)

        # Move in XY only while at safe Z
        if current_x != x or current_y != y:
            self._send_gcode(f"G1 X{x:.2f} Y{y:.2f} F{self.XY_SPEED}")
            self._send_gcode("M400")

        # Move probe down/up to target Z
        self._move_z(z)


    # A short relative move by the operator who watches the probe: no lift to SAFE_Z,
    # so the tip can be walked onto a sheet target or a board at working height.
    # Slow near the PCB, capped at MAX_JOG_MM per call, same axis limits as move_to.
    def jog(self, dx: float, dy: float, dz: float) -> None:
        if max(abs(dx), abs(dy), abs(dz)) > self.MAX_JOG_MM:
            raise ValueError(f"a jog moves at most {self.MAX_JOG_MM:g} mm at a time")
        x, y, z = self.get_position()
        target_x, target_y, target_z = x + dx, y + dy, z + dz
        self._validate_position(target_x, target_y, target_z)
        if dx or dy:
            speed = self.XY_SPEED if z >= self.SLOW_Z_THRESHOLD else self.Z_SPEED_SLOW
            self._send_gcode(f"G1 X{target_x:.2f} Y{target_y:.2f} F{speed}")
            self._send_gcode("M400")
        if dz:
            self._move_z(target_z)


    # Special Z movement function, includes different speeds:
    # - Slow in areas near the PCB board (< SLOW_Z_THRESHOLD)
    # - Faster in areas further away from the PCB board (> SLOW_Z_THRESHOLD)
    def _move_z(self, z: float) -> None:
        self._validate_axis("Z", z,(max(self.MIN_SAFE_Z, self.Z_RANGE[0]), self.Z_RANGE[1]))
        _, _, current_z = self.get_position()

        # Moving down toward PCB
        if z < current_z:
            if current_z > self.SLOW_Z_THRESHOLD > z:
                self._move_z_raw(self.SLOW_Z_THRESHOLD, self.Z_SPEED_FAST)
                self._move_z_raw(z, self.Z_SPEED_SLOW)
            else:
                speed = self.Z_SPEED_SLOW if z < self.SLOW_Z_THRESHOLD else self.Z_SPEED_FAST
                self._move_z_raw(z, speed)

        # Moving up away from PCB
        elif z > current_z:
            if current_z < self.SLOW_Z_THRESHOLD < z:
                self._move_z_raw(self.SLOW_Z_THRESHOLD, self.Z_SPEED_SLOW)
                self._move_z_raw(z, self.Z_SPEED_FAST)
            else:
                speed = self.Z_SPEED_SLOW if current_z < self.SLOW_Z_THRESHOLD else self.Z_SPEED_FAST
                self._move_z_raw(z, speed)


    def _move_z_raw(self, z: float, speed: int) -> None:
        self._send_gcode(f"G1 Z{z:.2f} F{speed}")
        self._send_gcode("M400")


    # Validate all axis ranges, raises error when values outside specified ranges
    def _validate_position(self, x: float, y: float, z: float) -> None:
        self._validate_axis("X", x, self.X_RANGE)
        self._validate_axis("Y", y, self.Y_RANGE)
        self._validate_axis("Z", z,(max(self.MIN_SAFE_Z, self.Z_RANGE[0]), self.Z_RANGE[1]))


    @staticmethod
    def _validate_axis(axis: str, value: float, allowed_range: tuple[float, float]) -> None:
        if not isinstance(value, (int, float)):
            raise TypeError(f"{axis} must be numeric, got {type(value).__name__}")

        minimum, maximum = allowed_range

        if not minimum <= value <= maximum:
            raise ValueError(f"{axis}={value} is outside allowed range [{minimum}, {maximum}]")
