from __future__ import annotations

from typing import Protocol

from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, ConfigDict, Field


class MotionController(Protocol):
    """The subset of UltimakerMotion used by the agent tools."""

    def is_reachable(self) -> bool: ...

    def home(self) -> None: ...

    def get_position(self) -> tuple[float, float, float]: ...

    def move_to(self, x: float, y: float, z: float) -> None: ...


class MoveToInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float = Field(description="Target X coordinate in millimetres.")
    y: float = Field(description="Target Y coordinate in millimetres.")
    z: float = Field(description="Target Z coordinate in millimetres.")


def create_motion_tools(motion: MotionController) -> list[BaseTool]:
    """Create tools bound to one motion-controller instance."""

    @tool("is_printer_reachable")
    def is_printer_reachable() -> dict:
        """Check whether the Ultimaker responds to commands."""
        return {"reachable": motion.is_reachable()}

    @tool("home_printer")
    def home_printer() -> dict:
        """Home all Ultimaker axes and wait until homing is complete."""
        motion.home()
        return {"success": True, "position": _position_dict(motion.get_position())}

    @tool("get_printer_position")
    def get_printer_position() -> dict:
        """Read the current Ultimaker X, Y, and Z position in millimetres."""
        return {"position": _position_dict(motion.get_position())}

    @tool("move_printer_to", args_schema=MoveToInput)
    def move_printer_to(x: float, y: float, z: float) -> dict:
        """Move safely to an absolute XYZ position using UltimakerMotion."""
        motion.move_to(x, y, z)
        return {"success": True, "position": _position_dict(motion.get_position())}

    return [
        is_printer_reachable,
        home_printer,
        get_printer_position,
        move_printer_to,
    ]


def _position_dict(position: tuple[float, float, float]) -> dict[str, float]:
    x, y, z = position
    return {"x": x, "y": y, "z": z}

