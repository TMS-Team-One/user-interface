from __future__ import annotations

from collections.abc import Iterable

from langchain_core.tools import BaseTool


class ToolRegistry:
    """Small registry used by both the model and the tool executor."""

    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool already registered: {tool.name}")
        self._tools[tool.name] = tool

    def register_many(self, tools: Iterable[BaseTool]) -> None:
        for tool in tools:
            self.register(tool)

    def get(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    @property
    def tools(self) -> list[BaseTool]:
        return list(self._tools.values())

    @property
    def names(self) -> tuple[str, ...]:
        return tuple(self._tools)

