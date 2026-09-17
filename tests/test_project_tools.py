from __future__ import annotations

from dataclasses import dataclass

import pytest
from pydantic import ValidationError

import src.main.tools.project as project_tools
from src.main.tools.project import create_project_tools


def _tools(context: dict) -> dict:
    return {tool.name: tool for tool in create_project_tools(context)}


def test_list_files_returns_only_current_project_metadata() -> None:
    tools = _tools(
        {
            "project_files": [
                {
                    "id": 11,
                    "file_name": "manual.txt",
                    "kind": "unknown",
                    "content": "private file contents",
                },
                {
                    "id": 12,
                    "file_name": "board.gtl",
                    "kind": "gerber",
                    "content": "gerber commands",
                },
            ]
        }
    )

    result = tools["list_files"].invoke({})

    assert result == [
        {"id": 11, "file_name": "manual.txt"},
        {"id": 12, "file_name": "board.gtl"},
    ]
    assert "private file contents" not in str(result)
    assert "gerber commands" not in str(result)


def test_read_file_returns_text_verbatim() -> None:
    tools = _tools(
        {
            "project_files": [
                {
                    "id": 7,
                    "file_name": "notes.txt",
                    "kind": "unknown",
                    "content": "line one\nline two\n",
                }
            ]
        }
    )

    assert tools["read_file"].invoke({"id": 7}) == {
        "id": 7,
        "file_name": "notes.txt",
        "format": "text",
        "content": "line one\nline two\n",
    }


@dataclass
class _ParsedGerber:
    pads: list
    bounds: None = None


@pytest.mark.parametrize(
    ("file_name", "expected_type"),
    [
        ("board.grb", "infer_from_attributes"),
        ("board.GBR", "infer_from_attributes"),
        ("top.gto", "silk"),
        ("bottom.gbo", "silk"),
        ("top.gpt", "pads"),
        ("bottom.gpb", "pads"),
        ("top.gts", "soldermask"),
        ("bottom.gbs", "soldermask"),
        ("top.gtl", "copper"),
        ("bottom.gbl", "copper"),
        ("top.gtp", "paste"),
        ("bottom.gbp", "paste"),
    ],
)
def test_read_file_parses_every_gerber_extension(
    monkeypatch: pytest.MonkeyPatch, file_name: str, expected_type: str
) -> None:
    calls: list[tuple[str, str, bool]] = []

    def fake_parse(content: str, *, filename: str, copper_only: bool) -> _ParsedGerber:
        calls.append((content, filename, copper_only))
        return _ParsedGerber(pads=[{"x": 1.0, "y": 2.0}])

    monkeypatch.setattr(project_tools, "parse_gerber", fake_parse)
    tools = _tools(
        {
            "project_files": [
                {
                    "id": 3,
                    "file_name": file_name,
                    "kind": "unknown",
                    "content": "D03*",
                }
            ]
        }
    )

    result = tools["read_file"].invoke({"id": 3})

    assert calls == [("D03*", file_name, False)]
    assert result == {
        "id": 3,
        "file_name": file_name,
        "format": "parsed-gerber",
        "file_type": expected_type,
        "content": {"pads": [{"x": 1.0, "y": 2.0}], "bounds": None},
    }


def test_read_file_rejects_an_id_outside_the_current_project() -> None:
    tools = _tools(
        {
            "project_files": [
                {
                    "id": 1,
                    "file_name": "current.txt",
                    "kind": "unknown",
                    "content": "current",
                }
            ]
        }
    )

    with pytest.raises(ValueError, match="current project"):
        tools["read_file"].invoke({"id": 999})


@pytest.mark.parametrize("bad_id", [True, "1", 0, -1])
def test_read_file_requires_a_strict_positive_integer(bad_id: object) -> None:
    tools = _tools({"project_files": []})

    with pytest.raises(ValidationError):
        tools["read_file"].invoke({"id": bad_id})
