"""Per-test chat sessions and UI-friendly LangGraph event translation."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any
from uuid import uuid4

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage


EventEmitter = Callable[[dict[str, object]], None]


class AgentChatSessions:
    """Keep in-memory chat history and stream normalized agent activity."""

    def __init__(self, graph_factory: Callable[[], Any], home: Callable[[], object]) -> None:
        self._graph_factory = graph_factory
        self._home = home
        self._graph: Any | None = None
        self._messages: dict[int, list[object]] = {}
        self._timeline: dict[int, list[dict[str, object]]] = {}
        self._initialized: set[int] = set()

    def history(self, test_id: int) -> dict[str, object]:
        return {"items": list(self._timeline.get(test_id, []))}

    def invalidate_homing(self) -> None:
        self._initialized.clear()

    def chat(
        self,
        *,
        test_id: int,
        message: str,
        test_name: str,
        file_name: str,
        emit: EventEmitter,
    ) -> dict[str, object]:
        timeline = self._timeline.setdefault(test_id, [])
        user_item = {
            "type": "message",
            "id": uuid4().hex,
            "role": "user",
            "content": message,
        }
        timeline.append(user_item)

        if test_id not in self._initialized:
            self._home_new_chat(test_id, timeline, emit)

        emit({"type": "thinking", "message": "Planning the next action…"})
        graph = self._get_graph()
        previous_messages = self._messages.get(test_id, [])
        input_messages = [*previous_messages, HumanMessage(content=message)]
        produced_messages: list[object] = []

        context = (
            f"Current test case: {test_name}. Source file: {file_name}. "
            "The printer has been homed for this chat session."
        )
        stream = graph.stream(
            {
                "messages": input_messages,
                "step_count": 0,
                "test_context": context,
            },
            stream_mode=["messages", "updates"],
            version="v2",
        )

        for part in stream:
            part_type = part.get("type")
            if part_type == "messages":
                self._emit_message_delta(part.get("data"), emit)
            elif part_type == "updates":
                self._handle_updates(
                    part.get("data"), timeline, produced_messages, emit
                )

        self._messages[test_id] = [*input_messages, *produced_messages]
        return self.history(test_id)

    def _home_new_chat(
        self,
        test_id: int,
        timeline: list[dict[str, object]],
        emit: EventEmitter,
    ) -> None:
        item = {
            "type": "tool",
            "id": f"home-{uuid4().hex}",
            "name": "home_printer",
            "args": {},
            "status": "running",
        }
        timeline.append(item)
        emit({"type": "tool-started", "item": dict(item)})
        try:
            result = self._home()
        except Exception as error:
            item.update({"status": "error", "error": str(error)})
            emit({"type": "tool-failed", "item": dict(item)})
            raise

        item.update({"status": "success", "result": result})
        emit({"type": "tool-completed", "item": dict(item)})
        self._initialized.add(test_id)

    def _get_graph(self) -> Any:
        if self._graph is None:
            self._graph = self._graph_factory()
        return self._graph

    @staticmethod
    def _emit_message_delta(data: object, emit: EventEmitter) -> None:
        if not isinstance(data, tuple) or len(data) != 2:
            return
        message_chunk, metadata = data
        if not isinstance(metadata, dict) or metadata.get("langgraph_node") != "agent":
            return
        if getattr(message_chunk, "tool_call_chunks", None):
            return
        text = _message_text(getattr(message_chunk, "content", ""))
        if text:
            emit({"type": "assistant-delta", "content": text})

    def _handle_updates(
        self,
        data: object,
        timeline: list[dict[str, object]],
        produced_messages: list[object],
        emit: EventEmitter,
    ) -> None:
        if not isinstance(data, dict):
            return
        for node_name, update in data.items():
            if not isinstance(update, dict):
                continue
            messages = update.get("messages", [])
            if not isinstance(messages, list):
                messages = [messages]
            produced_messages.extend(messages)

            for message in messages:
                if isinstance(message, AIMessage):
                    self._handle_ai_message(message, timeline, emit)
                elif isinstance(message, ToolMessage):
                    self._handle_tool_message(message, timeline, emit)

            if node_name in {"execute_tools", "reject_tools"}:
                emit({"type": "thinking", "message": "Reviewing the tool result…"})

    @staticmethod
    def _handle_ai_message(
        message: AIMessage,
        timeline: list[dict[str, object]],
        emit: EventEmitter,
    ) -> None:
        if message.tool_calls:
            for call in message.tool_calls:
                item = {
                    "type": "tool",
                    "id": call["id"],
                    "name": call["name"],
                    "args": call.get("args") or {},
                    "status": "running",
                }
                timeline.append(item)
                emit({"type": "tool-started", "item": dict(item)})
            return

        content = _message_text(message.content)
        if not content:
            return
        item = {
            "type": "message",
            "id": message.id or uuid4().hex,
            "role": "assistant",
            "content": content,
        }
        timeline.append(item)
        emit({"type": "assistant-completed", "item": dict(item)})

    @staticmethod
    def _handle_tool_message(
        message: ToolMessage,
        timeline: list[dict[str, object]],
        emit: EventEmitter,
    ) -> None:
        item = next(
            (
                candidate
                for candidate in reversed(timeline)
                if candidate.get("type") == "tool"
                and candidate.get("id") == message.tool_call_id
            ),
            None,
        )
        if item is None:
            return

        try:
            payload = json.loads(str(message.content))
        except json.JSONDecodeError:
            payload = {"ok": False, "message": str(message.content)}

        if payload.get("ok"):
            item.update({"status": "success", "result": payload.get("result")})
            emit({"type": "tool-completed", "item": dict(item)})
        else:
            item.update(
                {
                    "status": "error",
                    "error": payload.get("message") or "Tool execution failed",
                }
            )
            emit({"type": "tool-failed", "item": dict(item)})


def _message_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    return "".join(
        str(block.get("text", ""))
        for block in content
        if isinstance(block, dict) and block.get("type") == "text"
    )
