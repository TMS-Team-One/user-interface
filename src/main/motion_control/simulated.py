import time


class SimulatedMotion:
    """
    Stand-in for UltimakerMotion when no printer is connected: same public
    methods, same safety rules, and each move takes as long as the real head
    would need at the configured speeds.
    """
    SAFE_Z = 50.0
    XY_SPEED = 3000      # mm/min
    Z_SPEED_FAST = 1000  # mm/min
    Z_SPEED_SLOW = 300   # mm/min
    SLOW_Z_THRESHOLD = 30.0
    MAX_JOG_MM = 10.0

    def __init__(self, time_scale: float = 1.0):
        # time_scale < 1 runs faster than real time (useful for demos), 0 skips the waits
        self.time_scale = time_scale
        self.position = (0.0, 0.0, self.SAFE_Z)

    def is_reachable(self) -> bool:
        return True

    def home(self) -> None:
        self.position = (0.0, 0.0, self.SAFE_Z)

    def get_position(self) -> tuple[float, float, float]:
        return self.position

    def move_to(self, x: float, y: float, z: float) -> None:
        current_x, current_y, current_z = self.position
        if current_z < self.SAFE_Z:
            self._move_z(self.SAFE_Z)
        if current_x != x or current_y != y:
            distance = ((x - current_x) ** 2 + (y - current_y) ** 2) ** 0.5
            self._wait(distance, self.XY_SPEED)
            self.position = (x, y, self.position[2])
        self._move_z(z)

    def jog(self, dx: float, dy: float, dz: float) -> None:
        if max(abs(dx), abs(dy), abs(dz)) > self.MAX_JOG_MM:
            raise ValueError(f"a jog moves at most {self.MAX_JOG_MM:g} mm at a time")
        x, y, z = self.position
        if dx or dy:
            self._wait((dx ** 2 + dy ** 2) ** 0.5, self.XY_SPEED)
            self.position = (x + dx, y + dy, z)
        if dz:
            self._move_z(z + dz)

    def _move_z(self, z: float) -> None:
        current_z = self.position[2]
        speed = self.Z_SPEED_SLOW if min(z, current_z) < self.SLOW_Z_THRESHOLD else self.Z_SPEED_FAST
        self._wait(abs(z - current_z), speed)
        self.position = (self.position[0], self.position[1], z)

    def _wait(self, distance_mm: float, speed_mm_per_min: float) -> None:
        time.sleep(distance_mm / speed_mm_per_min * 60 * self.time_scale)
