import json

from langchain_core.messages import AIMessage, AIMessageChunk, ToolMessage

from src.main.agent.session import AgentChatSessions


class FakeGraph:
    def __init__(self) -> None:
        self.inputs: list[dict] = []

    def stream(self, inputs: dict, **options: object):
        self.inputs.append(inputs)
        assert options == {
            "stream_mode": ["messages", "updates"],
            "version": "v2",
        }

        tool_call = {
            "name": "get_printer_position",
            "args": {},
            "id": "call-position",
            "type": "tool_call",
        }
        yield {
            "type": "updates",
            "data": {
                "agent": {
                    "messages": [AIMessage(content="", tool_calls=[tool_call])]
                }
            },
        }
        yield {
            "type": "updates",
            "data": {
                "execute_tools": {
                    "messages": [
                        ToolMessage(
                            content=json.dumps(
                                {
                                    "ok": True,
                                    "result": {
                                        "position": {"x": 10, "y": 20, "z": 50}
                                    },
                                }
                            ),
                            tool_call_id="call-position",
                            name="get_printer_position",
                        )
                    ]
                }
            },
        }
        yield {
            "type": "messages",
            "data": (
                AIMessageChunk(content="Position read."),
                {"langgraph_node": "agent"},
            ),
        }
        yield {
            "type": "updates",
            "data": {
                "agent": {
                    "messages": [
                        AIMessage(content="Position read.", id="assistant-position")
                    ]
                }
            },
        }


def test_new_chat_homes_before_agent_and_streams_tool_activity() -> None:
    graph = FakeGraph()
    home_calls: list[bool] = []
    events: list[dict[str, object]] = []
    sessions = AgentChatSessions(
        lambda _context: graph,
        lambda: home_calls.append(True) or {"homed": True},
    )

    result = sessions.chat(
        project_id=1,
        message="Where is the probe?",
        context={"name": "Power rail", "files": ["power.gbr"]},
        emit=events.append,
    )

    assert len(home_calls) == 1
    assert events[0]["type"] == "tool-started"
    assert events[0]["item"]["name"] == "home_printer"
    assert events[1]["type"] == "tool-completed"
    assert any(event["type"] == "assistant-delta" for event in events)
    assert any(event["type"] == "tool-completed" for event in events[2:])
    assert result["items"][-1]["content"] == "Position read."
    assert "Current project: Power rail. Files: power.gbr" in graph.inputs[0]["chat_context"]


def test_existing_chat_keeps_history_without_homing_again() -> None:
    graph = FakeGraph()
    home_calls: list[bool] = []
    sessions = AgentChatSessions(
        lambda _context: graph,
        lambda: home_calls.append(True) or {"homed": True},
    )

    for message in ("First", "Second"):
        sessions.chat(
            project_id=1,
            message=message,
            context={"name": "Board", "files": ["board.gbr"]},
            emit=lambda _event: None,
        )

    assert len(home_calls) == 1
    assert len(graph.inputs[1]["messages"]) > len(graph.inputs[0]["messages"])


def test_different_project_and_disconnect_require_new_home() -> None:
    graph = FakeGraph()
    home_calls: list[bool] = []
    sessions = AgentChatSessions(
        lambda _context: graph,
        lambda: home_calls.append(True) or {"homed": True},
    )

    def chat(project_id: int) -> None:
        sessions.chat(
            project_id=project_id,
            message="Hello",
            context={"name": f"Board {project_id}", "files": ["board.gbr"]},
            emit=lambda _event: None,
        )

    chat(1)
    chat(2)
    sessions.invalidate_homing()
    chat(1)

    assert len(home_calls) == 3
