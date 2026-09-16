"""Long-lived JSON-lines bridge between Electron and the probing hardware."""

from __future__ import annotations

import json
import logging
import math
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol

from dotenv import load_dotenv

from src.main.agent.session import AgentChatSessions, EventEmitter
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
        self._chat_sessions: AgentChatSessions | None = None

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
        if self._chat_sessions is not None:
            self._chat_sessions.invalidate_homing()
        return self._connection_status(False)

    def handle(
        self,
        method: str,
        params: object = None,
        emit: EventEmitter | None = None,
    ) -> dict[str, object]:
        if method == "connect":
            return self.connect()
        if method == "status":
            return self.status()
        if method == "home":
            return self.home()
        if method == "run_manual_test":
            return self.run_manual_test(params)
        if method == "chat_history":
            test_id = self._chat_test_id(params)
            return self._get_chat_sessions().history(test_id)
        if method == "chat":
            return self._chat(params, emit or (lambda _event: None))
        if method == "disconnect":
            return self.disconnect()
        raise ValueError(f"Unknown hardware method: {method}")

    def _chat(self, params: object, emit: EventEmitter) -> dict[str, object]:
        if not isinstance(params, dict):
            raise ValueError("Chat parameters are required")
        test_id = self._chat_test_id(params)
        message = params.get("message")
        test_name = params.get("test_name")
        file_name = params.get("file_name")
        if not isinstance(message, str) or not message.strip():
            raise ValueError("Chat message must not be empty")
        if not isinstance(test_name, str) or not isinstance(file_name, str):
            raise ValueError("Test case context is incomplete")
        return self._get_chat_sessions().chat(
            test_id=test_id,
            message=message.strip(),
            test_name=test_name,
            file_name=file_name,
            emit=emit,
        )

    @staticmethod
    def _chat_test_id(params: object) -> int:
        if not isinstance(params, dict):
            raise ValueError("Chat parameters are required")
        test_id = params.get("test_id")
        if isinstance(test_id, bool) or not isinstance(test_id, int):
            raise ValueError("Test case ID must be an integer")
        return test_id

    def _get_chat_sessions(self) -> AgentChatSessions:
        if self._chat_sessions is None:
            self._chat_sessions = AgentChatSessions(self._build_agent_graph, self.home)
        return self._chat_sessions

    def _build_agent_graph(self) -> object:
        from src.main.agent.graph import build_agent_graph
        from src.main.agent.model import create_chat_model
        from src.main.tools.motion import create_motion_tools
        from src.main.tools.registry import ToolRegistry
        from src.main.tools.voltage import create_voltage_tools

        registry = ToolRegistry()
        registry.register_many(create_motion_tools(_AgentMotionController(self)))
        registry.register_many(create_voltage_tools(_AgentVoltageMeter(self)))
        return build_agent_graph(create_chat_model(), registry)

    def _agent_measure_voltage(
        self,
        *,
        duration: float,
        max_wait: float,
        scale: float,
        absolute: bool,
    ) -> float:
        motion = self._require_motion()
        if not self._homed:
            raise RuntimeError("Home the Ultimaker before measuring voltage")
        voltage_meter = self._get_voltage_meter()
        try:
            return voltage_meter.measure_voltage(
                duration=duration,
                max_wait=max_wait,
                scale=scale,
                absolute=absolute,
            )
        except Exception as measurement_error:
            user_error = self._measurement_error(measurement_error)
            self._discard_voltage_meter()
            if user_error is measurement_error:
                raise
            raise user_error from measurement_error
        finally:
            x, y, z = motion.get_position()
            if z < motion.SAFE_Z:
                motion.move_to(x, y, motion.SAFE_Z)

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


class _AgentMotionController:
    """Expose bridge-owned motion to agent tools without opening another port."""

    def __init__(self, bridge: HardwareBridge) -> None:
        self._bridge = bridge

    def is_reachable(self) -> bool:
        return self._bridge.status()["connected"]

    def home(self) -> None:
        self._bridge.home()

    def get_position(self) -> tuple[float, float, float]:
        return self._bridge._require_motion().get_position()

    def move_to(self, x: float, y: float, z: float) -> None:
        motion = self._bridge._require_motion()
        if not self._bridge._homed:
            raise RuntimeError("Home the Ultimaker before moving it")
        motion.move_to(x, y, z)


class _AgentVoltageMeter:
    """Measure through the bridge and retract automatically after every reading."""

    def __init__(self, bridge: HardwareBridge) -> None:
        self._bridge = bridge

    def measure_voltage(
        self,
        *,
        duration: float = 0.5,
        max_wait: float = 7.0,
        scale: float = 1.0,
        absolute: bool = True,
    ) -> float:
        return self._bridge._agent_measure_voltage(
            duration=duration,
            max_wait=max_wait,
            scale=scale,
            absolute=absolute,
        )


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


def _event(request_id: object, data: dict[str, object]) -> str:
    return json.dumps(
        {"event": "chat", "requestId": request_id, "data": data},
        separators=(",", ":"),
    )


def main() -> None:
    load_dotenv(Path.cwd() / ".env")
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
                    result=bridge.handle(
                        method,
                        request.get("params"),
                        emit=lambda data: print(_event(request_id, data), flush=True),
                    ),
                )
            except (
                ConnectionError,
                RuntimeError,
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
