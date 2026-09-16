from __future__ import annotations

import json
from typing import Literal

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph

from .state import AgentState
from ..tools.registry import ToolRegistry


DEFAULT_SYSTEM_PROMPT = """You control an Ultimaker-based PCB probing robot and
can measure voltage between its probe channels. Use only the provided tools.
Request at most one tool per response, inspect its result and stop if a tool
reports an error. Never generate raw G-code. The motion controller enforces the
machine's coordinate and safe-height limits.
"""

r"""
    START
      ↓
|─→ agent
|     ├── no tool requested ─────────────→ END
|     ├── step limit reached ────────────→ terminate → END
|     └── tool requested
|                 ↓
|               guard
|              /     \
|         accepted   rejected
|            ↓          ↓
|         execute     return error
|            \          /
|               agent
└─────────────────|
"""
def build_agent_graph(
    model: BaseChatModel,
    registry: ToolRegistry,
    *,
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    max_steps: int = 10,
    max_tool_calls_per_step: int = 1,
):
    """Build a guarded model -> tools -> model LangGraph workflow."""
    if not registry.tools:
        raise ValueError("At least one tool must be registered.")
    if max_steps < 1 or max_tool_calls_per_step < 1:
        raise ValueError("Graph limits must be positive integers.")

    nodes = _AgentNodes(
        model=model,
        registry=registry,
        system_prompt=system_prompt,
        max_steps=max_steps,
        max_tool_calls_per_step=max_tool_calls_per_step,
    )

    graph = StateGraph(AgentState)
    graph.add_node("agent", nodes.agent_node)
    graph.add_node("guard", nodes.guard_node)
    graph.add_node("execute_tools", nodes.execute_tools)
    graph.add_node("reject_tools", nodes.reject_tools)
    graph.add_node("terminate", nodes.terminate)

    graph.add_edge(START, "agent")
    graph.add_conditional_edges("agent", nodes.route_after_agent)
    graph.add_conditional_edges("guard", nodes.route_after_guard)
    graph.add_edge("execute_tools", "agent")
    graph.add_edge("reject_tools", "agent")
    graph.add_edge("terminate", END)

    return graph.compile()


def _latest_tool_calls(state: AgentState) -> list[dict]:
    message = state["messages"][-1]
    if not isinstance(message, AIMessage):
        return []
    return message.tool_calls


def _tool_message(call: dict, payload: dict) -> ToolMessage:
    return ToolMessage(
        content=json.dumps(payload, default=str, sort_keys=True),
        tool_call_id=call["id"],
        name=call["name"],
    )


class _AgentNodes:

    def __init__(
        self,
        model: BaseChatModel,
        registry: ToolRegistry,
        system_prompt: str,
        max_steps: int,
        max_tool_calls_per_step: int,
    ) -> None:
        self.model = model.bind_tools(registry.tools)
        self.registry = registry
        self.system_prompt = system_prompt
        self.max_steps = max_steps
        self.max_tool_calls_per_step = max_tool_calls_per_step

    def agent_node(self, state: AgentState) -> dict:
        response = self.model.invoke(
            [SystemMessage(content=self.system_prompt), *state["messages"]]
        )
        return {
            "messages": [response],
            "step_count": state.get("step_count", 0) + 1,
            "guard_error": None,
        }

    def route_after_agent(self, state: AgentState) -> Literal["guard", "terminate", "__end__"]:
        calls = _latest_tool_calls(state)
        if not calls:
            return END
        if state.get("step_count", 0) >= self.max_steps:
            return "terminate"
        return "guard"

    def guard_node(self, state: AgentState) -> dict:
        calls = _latest_tool_calls(state)
        if len(calls) > self.max_tool_calls_per_step:
            return {
                "guard_error": (
                    f"At most {self.max_tool_calls_per_step} tool call(s) are allowed "
                    "per model response."
                )
            }

        unknown = [call["name"] for call in calls if self.registry.get(call["name"]) is None]
        if unknown:
            return {"guard_error": f"Unknown tool(s): {', '.join(unknown)}"}
        return {"guard_error": None}

    def route_after_guard(self, state: AgentState) -> Literal["execute_tools", "reject_tools"]:
        return "reject_tools" if state.get("guard_error") else "execute_tools"

    def execute_tools(self, state: AgentState) -> dict:
        messages: list[ToolMessage] = []
        # Deliberately synchronous: hardware calls must never run in parallel.
        for call in _latest_tool_calls(state):
            tool = self.registry.get(call["name"])
            if tool is None:  # The guard makes this unreachable, but fail closed.
                raise RuntimeError(f"Tool disappeared from registry: {call['name']}")
            try:
                result = tool.invoke(call["args"])
                payload = {"ok": True, "result": result}
            except Exception as exc:
                payload = {
                    "ok": False,
                    "error": type(exc).__name__,
                    "message": str(exc),
                }
            messages.append(_tool_message(call, payload))
        return {"messages": messages}

    def reject_tools(self, state: AgentState) -> dict:
        payload = {
            "ok": False,
            "error": "ToolCallRejected",
            "message": state.get("guard_error") or "Tool call rejected.",
        }
        return {
            "messages": [
                _tool_message(call, payload) for call in _latest_tool_calls(state)
            ]
        }

    def terminate(self, state: AgentState) -> dict:
        payload = {
            "ok": False,
            "error": "StepLimitReached",
            "message": f"Stopped after {self.max_steps} model steps.",
        }
        messages: list = [
            _tool_message(call, payload) for call in _latest_tool_calls(state)
        ]
        messages.append(AIMessage(content=payload["message"]))
        return {"messages": messages}
