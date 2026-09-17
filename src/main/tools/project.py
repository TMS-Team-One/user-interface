from __future__ import annotations

from langchain_core.tools import BaseTool, tool


def create_project_tools(context: dict) -> list[BaseTool]:
    """Tools that let the agent look at the project the desktop app is showing.

    `context` is the document the app sends with each chat message: the project
    name and files, its pads with testability, and the last test run's results.
    """

    @tool("get_project_summary")
    def get_project_summary() -> dict:
        """Name, files and pad counts of the project, and the board pose on the bed if synced."""
        pads = context.get("pads", [])
        return {
            "name": context.get("name"),
            "files": context.get("files", []),
            "pads": len(pads),
            "testable_pads": sum(1 for pad in pads if pad.get("testable")),
            "pose": context.get("pose"),
        }

    @tool("list_testable_pads")
    def list_testable_pads() -> list[dict]:
        """Every pad the probe can be put on: label, net and position in board millimetres."""
        return [pad for pad in context.get("pads", []) if pad.get("testable")]

    @tool("get_last_run")
    def get_last_run() -> dict:
        """Backend used and the voltage measured at each pad in the last test run."""
        return context.get("last_run") or {"message": "no test run yet"}

    return [get_project_summary, list_testable_pads, get_last_run]
