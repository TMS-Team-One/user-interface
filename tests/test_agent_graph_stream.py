from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool

from src.main.agent.graph import build_agent_graph
from src.main.agent.session import AgentChatSessions
from src.main.tools.registry import ToolRegistry


class FakeToolCallingModel(BaseChatModel):
    responses: list[AIMessage]

    @property
    def _llm_type(self) -> str:
        return "fake-tool-calling-model"

    def bind_tools(self, _tools: list, **_kwargs: object) -> BaseChatModel:
        return self

    def _generate(self, _messages: list, **_kwargs: object) -> ChatResult:
        return ChatResult(
            generations=[ChatGeneration(message=self.responses.pop(0))]
        )


def test_real_graph_stream_is_translated_into_chat_events() -> None:
    @tool
    def get_printer_position() -> dict:
        """Return the current printer position."""
        return {"position": {"x": 1.0, "y": 2.0, "z": 50.0}}

    model = FakeToolCallingModel(
        responses=[
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "get_printer_position",
                        "args": {},
                        "id": "call-position",
                        "type": "tool_call",
                    }
                ],
            ),
            AIMessage(content="The probe is at X=1, Y=2, Z=50."),
        ]
    )
    registry = ToolRegistry()
    registry.register(get_printer_position)
    graph = build_agent_graph(model, registry)
    events: list[dict[str, object]] = []
    sessions = AgentChatSessions(lambda: graph, lambda: {"homed": True})

    result = sessions.chat(
        test_id=1,
        message="Where is the probe?",
        test_name="Board",
        file_name="board.gbr",
        emit=events.append,
    )

    event_types = [event["type"] for event in events]
    assert "tool-started" in event_types
    assert "tool-completed" in event_types
    assert "assistant-completed" in event_types
    assert result["items"][-1]["content"] == "The probe is at X=1, Y=2, Z=50."
