from __future__ import annotations

from dataclasses import asdict

from langchain_core.tools import BaseTool, tool
from pydantic import BaseModel, Field

from ..parsing.gerber_parser import FileTypeEnum, gerber_file_type, main as parse_gerber


class ReadFileInput(BaseModel):
    id: int = Field(strict=True, gt=0, description="Database ID returned by list_files")


def create_project_tools(context: dict) -> list[BaseTool]:
    """Tools that let the agent look at the project the desktop app is showing.

    `context` is the document the app sends with each chat message: the project
    name and files, its pads with testability, and the last test run's results.
    """

    project_files = context.get("project_files", [])
    files_by_id = {
        file["id"]: file
        for file in project_files
        if isinstance(file, dict)
        and isinstance(file.get("id"), int)
        and not isinstance(file.get("id"), bool)
    }

    @tool("list_files")
    def list_files() -> list[dict]:
        """List the current project's uploaded file names and database IDs."""
        return [
            {"id": file_id, "file_name": file.get("file_name")}
            for file_id, file in files_by_id.items()
        ]

    @tool("read_file", args_schema=ReadFileInput)
    def read_file(id: int) -> dict:
        """Read one current-project file by an ID returned by list_files.

        Text files are returned verbatim. Gerber files are returned as parsed
        pads/flashes and board bounds, never as raw Gerber commands.
        """
        file = files_by_id.get(id)
        if file is None:
            raise ValueError("File not found in the current project")

        file_name = file.get("file_name")
        content = file.get("content")
        if not isinstance(file_name, str) or not isinstance(content, str):
            raise ValueError("The stored project file is incomplete")

        extension_type = gerber_file_type(file_name)
        is_gerber = file.get("kind") == "gerber" or extension_type is not None
        if not is_gerber:
            return {
                "id": id,
                "file_name": file_name,
                "format": "text",
                "content": content,
            }

        parsed = parse_gerber(
            content,
            filename=file_name,
            # The file-reading tool represents every Gerber layer, not only
            # conductive pads. Copper-only filtering remains the default for
            # the probing pipeline.
            copper_only=False,
        )
        file_type = extension_type or FileTypeEnum.INFER_FROM_ATTRIBUTES
        return {
            "id": id,
            "file_name": file_name,
            "format": "parsed-gerber",
            "file_type": file_type.value,
            "content": asdict(parsed),
        }

    @tool("get_project_summary")
    def get_project_summary() -> dict:
        """Name, files, pad, net and component counts of the project, and the board pose on the bed if synced."""
        pads = context.get("pads", [])
        netlist = context.get("netlist") or {}
        return {
            "name": context.get("name"),
            "files": context.get("files", []),
            "pads": len(pads),
            "testable_pads": sum(1 for pad in pads if pad.get("testable")),
            "nets": len(netlist.get("nets", [])),
            "components": len(netlist.get("components", [])),
            "pose": context.get("pose"),
        }

    @tool("list_nets")
    def list_nets() -> list[dict]:
        """Every net of the board with the component pins on it (as REFDES-PIN), from the netlist."""
        netlist = context.get("netlist")
        if not netlist:
            return [{"message": "no netlist with connectivity in this project"}]
        return netlist.get("nets", [])

    @tool("list_components")
    def list_components() -> list[dict]:
        """Every component of the board: reference designator, footprint and value, from the netlist."""
        netlist = context.get("netlist")
        if not netlist:
            return [{"message": "no netlist with components in this project"}]
        return netlist.get("components", [])

    @tool("list_testable_pads")
    def list_testable_pads() -> list[dict]:
        """Every pad the probe can be put on: label, net and position in board millimetres."""
        return [pad for pad in context.get("pads", []) if pad.get("testable")]

    @tool("get_last_run")
    def get_last_run() -> dict:
        """Backend used and the voltage measured at each pad in the last test run."""
        return context.get("last_run") or {"message": "no test run yet"}

    return [
        list_files,
        read_file,
        get_project_summary,
        list_testable_pads,
        get_last_run,
        list_nets,
        list_components,
    ]
