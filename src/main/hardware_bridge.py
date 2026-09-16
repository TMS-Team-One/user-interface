"""Long-lived JSON-lines bridge between Electron and the probing hardware."""

from __future__ import annotations

import json
import logging
import sys
from collections.abc import Callable
from typing import Any, Protocol

from src.main.motion_control.ultimaker import UltimakerMotion


logger = logging.getLogger(__name__)


class MotionConnection(Protocol):
    printer: Any

    def is_reachable(self) -> bool: ...


class HardwareBridge:
    """Own the one Ultimaker serial connection used by the desktop app."""

    def __init__(self, motion_factory: Callable[[], MotionConnection] = UltimakerMotion) -> None:
        self._motion_factory = motion_factory
        self._motion: MotionConnection | None = None

    def connect(self) -> dict[str, bool]:
        if self._motion is not None and self._is_open(self._motion):
            if self._motion.is_reachable():
                return {"connected": True}
            self.disconnect()

        motion = self._motion_factory()
        if not motion.is_reachable():
            self._close_motion(motion)
            raise ConnectionError("Ultimaker opened but did not respond to M115")

        self._motion = motion
        return {"connected": True}

    def status(self) -> dict[str, bool]:
        if self._motion is None or not self._is_open(self._motion):
            return {"connected": False}
        if not self._motion.is_reachable():
            self.disconnect()
            return {"connected": False}
        return {"connected": True}

    def disconnect(self) -> dict[str, bool]:
        if self._motion is not None:
            self._close_motion(self._motion)
            self._motion = None
        return {"connected": False}

    def handle(self, method: str) -> dict[str, bool]:
        if method == "connect":
            return self.connect()
        if method == "status":
            return self.status()
        if method == "disconnect":
            return self.disconnect()
        raise ValueError(f"Unknown hardware method: {method}")

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
                output = _response(request_id, result=bridge.handle(method))
            except Exception as error:
                logger.exception("Hardware request failed")
                output = _response(request_id, error=error)

            print(output, flush=True)
    finally:
        bridge.disconnect()


if __name__ == "__main__":
    main()
