from __future__ import annotations

import json
from typing import Literal

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph

from .state import AgentState
from ..tools.registry import ToolRegistry


DEFAULT_SYSTEM_PROMPT = """You control an Ultimaker-based PCB probing robot and
can measure voltage between its probe channels. Use only the provided tools.

IMPORTANT TOOL-SEQUENCING RULE: Issue at most one tool call in each model
response. Never place two movements or any other two tool calls in the same
response. If the task requires several actions or positions, call the first tool,
wait for its result, then request the next tool in a new response. Continue this
one-at-a-time sequence until the task is complete. Inspect every tool result and
stop if it reports an error.

Never generate raw G-code. The motion controller enforces the machine's
coordinate and safe-height limits. The application automatically homes the
printer before the first message in every new chat. Act autonomously without
asking the user to approve tool calls. After lowering the probe, finish at a safe
height; voltage measurements retract the probe automatically.
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


# The model reads images only in human messages, not in tool results, so a
# tool that took a picture (its result names a picture_path) gets the picture
# shown to the model in a message that follows the tool result.
PICTURE_MAX_WIDTH = 800
PICTURE_JPEG_QUALITY = 80


def picture_message(path: str) -> HumanMessage | None:
    import base64

    import cv2

    image = cv2.imread(path)
    if image is None:
        return None
    if image.shape[1] > PICTURE_MAX_WIDTH:
        scale = PICTURE_MAX_WIDTH / image.shape[1]
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    ok, jpeg = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, PICTURE_JPEG_QUALITY])
    if not ok:
        return None
    return HumanMessage(
        content=[
            {"type": "text", "text": "The picture the camera just took:"},
            {
                "type": "image_url",
                "image_url": {
                    "url": "data:image/jpeg;base64," + base64.b64encode(jpeg.tobytes()).decode("ascii"),
                    "detail": "low",
                },
            },
        ]
    )


def without_pictures(message: object) -> object:
    """The message with any image replaced by a note, for the history that is sent again."""
    if not isinstance(message, HumanMessage) or not isinstance(message.content, list):
        return message
    if not any(isinstance(block, dict) and block.get("type") == "image_url" for block in message.content):
        return message
    text = " ".join(
        str(block.get("text", "")) for block in message.content if isinstance(block, dict) and block.get("type") == "text"
    )
    return HumanMessage(content=f"{text} (picture no longer attached)".strip())


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
        context = state.get("chat_context")
        system_prompt = (
            f"{self.system_prompt}\n\n{context}" if context else self.system_prompt
        )
        response = self.model.invoke(
            [SystemMessage(content=system_prompt), *state["messages"]]
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
        messages: list[ToolMessage | HumanMessage] = []
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
            if isinstance(result := payload.get("result"), dict) and isinstance(result.get("picture_path"), str):
                picture = picture_message(result["picture_path"])
                if picture is not None:
                    messages.append(picture)
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
