"""Long-lived JSON-lines bridge between Electron and the probing hardware."""

from __future__ import annotations

import json
import logging
import math
import sys
from collections.abc import Callable
from typing import Any, Protocol

from src.main.motion_control.ultimaker import UltimakerMotion
from src.main.voltage_measurement.ads1115 import (
    ADS1115VoltageMeter,
    VoltageMeasurementError,
    VoltageMeterConnectionError,
)


logger = logging.getLogger(__name__)
VOLTAGE_DIVIDER_SCALE = (10_000 + 5_100) / 5_100


class MotionConnection(Protocol):
    SAFE_Z: float
    printer: Any

    def is_reachable(self) -> bool: ...

    def home(self) -> None: ...

    def get_position(self) -> tuple[float, float, float]: ...

    def move_to(self, x: float, y: float, z: float) -> None: ...


class VoltageConnection(Protocol):
    def measure_voltage(
        self,
        *,
        duration: float = 0.5,
        max_wait: float = 7.0,
        scale: float = 1.0,
        absolute: bool = True,
    ) -> float: ...

    def close(self) -> None: ...


class HardwareBridge:
    """Own the motion and measurement connections used by the desktop app."""

    def __init__(
        self,
        motion_factory: Callable[[], MotionConnection] = UltimakerMotion,
        voltage_factory: Callable[[], VoltageConnection] = ADS1115VoltageMeter,
    ) -> None:
        self._motion_factory = motion_factory
        self._voltage_factory = voltage_factory
        self._motion: MotionConnection | None = None
        self._voltage_meter: VoltageConnection | None = None
        self._homed = False

    def connect(self) -> dict[str, bool]:
        if self._motion is not None and self._is_open(self._motion):
            if self._motion.is_reachable():
                return self._connection_status(True)
            self.disconnect()

        motion = self._motion_factory()
        if not motion.is_reachable():
            self._close_motion(motion)
            raise ConnectionError("Ultimaker opened but did not respond to M115")

        self._motion = motion
        self._homed = False
        return self._connection_status(True)

    def status(self) -> dict[str, bool]:
        if self._motion is None or not self._is_open(self._motion):
            return self._connection_status(False)
        if not self._motion.is_reachable():
            self.disconnect()
            return self._connection_status(False)
        return self._connection_status(True)

    def home(self) -> dict[str, object]:
        motion = self._require_motion()
        motion.home()
        self._homed = True
        return {
            **self._connection_status(True),
            "position": self._position_dict(motion.get_position()),
        }

    def run_manual_test(self, params: object) -> dict[str, object]:
        motion = self._require_motion()
        if not self._homed:
            raise RuntimeError("Home the Ultimaker before running a manual test")

        x, y, z = self._coordinates(params)
        voltage_meter = self._get_voltage_meter()
        retract_z = max(z, motion.SAFE_Z)

        try:
            motion.move_to(x, y, z)
        except Exception as movement_error:
            self._retract_or_raise(motion, x, y, retract_z, movement_error)
            raise

        try:
            voltage = voltage_meter.measure_voltage(
                duration=0.5,
                max_wait=7.0,
                scale=VOLTAGE_DIVIDER_SCALE,
                absolute=True,
            )
        except Exception as measurement_error:
            user_error = self._measurement_error(measurement_error)
            self._discard_voltage_meter()
            self._retract_or_raise(motion, x, y, retract_z, user_error)
            if user_error is measurement_error:
                raise
            raise user_error from measurement_error

        motion.move_to(x, y, retract_z)
        return {
            "target": {"x": x, "y": y, "z": z},
            "voltage": voltage,
            "unit": "V",
            "retracted": True,
        }

    def disconnect(self) -> dict[str, bool]:
        self._discard_voltage_meter()
        if self._motion is not None:
            self._close_motion(self._motion)
            self._motion = None
        self._homed = False
        return self._connection_status(False)

    def handle(self, method: str, params: object = None) -> dict[str, object]:
        if method == "connect":
            return self.connect()
        if method == "status":
            return self.status()
        if method == "home":
            return self.home()
        if method == "run_manual_test":
            return self.run_manual_test(params)
        if method == "disconnect":
            return self.disconnect()
        raise ValueError(f"Unknown hardware method: {method}")

    def _require_motion(self) -> MotionConnection:
        if self._motion is None or not self._is_open(self._motion):
            self._homed = False
            raise ConnectionError("Connect the Ultimaker before controlling it")
        if not self._motion.is_reachable():
            self.disconnect()
            raise ConnectionError("Ultimaker connection was lost")
        return self._motion

    def _get_voltage_meter(self) -> VoltageConnection:
        if self._voltage_meter is None:
            try:
                self._voltage_meter = self._voltage_factory()
            except VoltageMeterConnectionError:
                raise
            except Exception as error:
                raise VoltageMeterConnectionError(
                    "Voltage meter not found. Connect the Arduino/ADS1115 and try again."
                ) from error
        return self._voltage_meter

    def _discard_voltage_meter(self) -> None:
        voltage_meter = self._voltage_meter
        self._voltage_meter = None
        if voltage_meter is None:
            return
        try:
            voltage_meter.close()
        except Exception:
            logger.warning("Failed to close voltage meter connection", exc_info=True)

    @staticmethod
    def _measurement_error(error: Exception) -> Exception:
        if isinstance(error, (VoltageMeterConnectionError, VoltageMeasurementError)):
            return error
        if isinstance(error, TimeoutError):
            if "did not stabilize" in str(error):
                return VoltageMeasurementError(
                    "Voltage did not stabilize. Check the probe contact and try again."
                )
            return VoltageMeterConnectionError(
                "No voltage data was received. Check the Arduino/ADS1115 connection and try again."
            )
        return VoltageMeasurementError(f"Voltage measurement failed: {error}")

    @staticmethod
    def _retract_or_raise(
        motion: MotionConnection,
        x: float,
        y: float,
        retract_z: float,
        original_error: Exception,
    ) -> None:
        try:
            motion.move_to(x, y, retract_z)
        except Exception as retract_error:
            raise RuntimeError(
                f"{original_error}; additionally failed to retract probe: {retract_error}"
            ) from original_error

    @staticmethod
    def _coordinates(params: object) -> tuple[float, float, float]:
        if not isinstance(params, dict):
            raise ValueError("Manual test parameters must contain X, Y, and Z coordinates")

        coordinates: list[float] = []
        for axis in ("x", "y", "z"):
            value = params.get(axis)
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"{axis.upper()} must be a number")
            coordinate = float(value)
            if not math.isfinite(coordinate):
                raise ValueError(f"{axis.upper()} must be finite")
            coordinates.append(coordinate)
        return coordinates[0], coordinates[1], coordinates[2]

    def _connection_status(self, connected: bool) -> dict[str, bool]:
        return {"connected": connected, "homed": connected and self._homed}

    @staticmethod
    def _position_dict(position: tuple[float, float, float]) -> dict[str, float]:
        x, y, z = position
        return {"x": x, "y": y, "z": z}

    @staticmethod
    def _is_open(motion: MotionConnection) -> bool:
        return bool(getattr(motion.printer, "is_open", False))

    @staticmethod
    def _close_motion(motion: MotionConnection) -> None:
        if getattr(motion.printer, "is_open", False):
            motion.printer.close()


def _response(request_id: object, *, result: object = None, error: Exception | None = None) -> str:
    if error is None:
        payload = {"id": request_id, "ok": True, "result": result}
    else:
        payload = {
            "id": request_id,
            "ok": False,
            "error": type(error).__name__,
            "message": str(error),
        }
    return json.dumps(payload, separators=(",", ":"))


def main() -> None:
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    bridge = HardwareBridge()

    try:
        for line in sys.stdin:
            if not line.strip():
                continue

            request_id: object = None
            try:
                request = json.loads(line)
                request_id = request.get("id")
                method = request.get("method")
                if not isinstance(method, str):
                    raise ValueError("Request method must be a string")
                output = _response(
                    request_id,
                    result=bridge.handle(method, request.get("params")),
                )
            except (
                ConnectionError,
                TimeoutError,
                ValueError,
                VoltageMeasurementError,
                VoltageMeterConnectionError,
            ) as error:
                logger.warning("Hardware request failed: %s", error)
                output = _response(request_id, error=error)
            except Exception as error:
                logger.exception("Hardware request failed")
                output = _response(request_id, error=error)

            print(output, flush=True)
    finally:
        bridge.disconnect()


if __name__ == "__main__":
    main()
