from pathlib import Path

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.tools import tool

from src.main.agent.graph import build_agent_graph, without_pictures
from src.main.agent.session import AgentChatSessions
from src.main.tools.registry import ToolRegistry

PICTURE = Path(__file__).parent / "fixtures" / "arduino_uno_r4" / "camera_tilted.jpg"


class RecordingModel(BaseChatModel):
    responses: list[AIMessage]
    seen: list[list] = []

    @property
    def _llm_type(self) -> str:
        return "recording-model"

    def bind_tools(self, _tools: list, **_kwargs: object) -> BaseChatModel:
        return self

    def _generate(self, messages: list, **_kwargs: object) -> ChatResult:
        self.seen.append(list(messages))
        return ChatResult(generations=[ChatGeneration(message=self.responses.pop(0))])


def picture_tool_graph(model: RecordingModel):
    @tool
    def take_picture() -> dict:
        """Take a picture."""
        return {"picture_path": str(PICTURE), "width": 1280, "height": 720}

    registry = ToolRegistry()
    registry.register(take_picture)
    return build_agent_graph(model, registry)


def test_the_model_is_shown_the_picture_after_the_tool_result() -> None:
    model = RecordingModel(
        responses=[
            AIMessage(content="", tool_calls=[{"name": "take_picture", "args": {}, "id": "call-1", "type": "tool_call"}]),
            AIMessage(content="I see the board."),
        ]
    )
    model.seen = []
    graph = picture_tool_graph(model)

    graph.invoke({"messages": [HumanMessage(content="What do you see?")], "step_count": 0})

    second_call = model.seen[1]
    assert isinstance(second_call[-2], ToolMessage)
    picture = second_call[-1]
    assert isinstance(picture, HumanMessage)
    blocks = picture.content
    assert blocks[1]["type"] == "image_url"
    assert blocks[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert blocks[1]["image_url"]["detail"] == "low"


def test_history_keeps_a_note_instead_of_the_picture() -> None:
    model = RecordingModel(
        responses=[
            AIMessage(content="", tool_calls=[{"name": "take_picture", "args": {}, "id": "call-1", "type": "tool_call"}]),
            AIMessage(content="Done."),
        ]
    )
    model.seen = []
    graph = picture_tool_graph(model)
    sessions = AgentChatSessions(lambda _context: graph, lambda: {"homed": True})

    sessions.chat(project_id=1, message="Look", context={"name": "Board", "files": []}, emit=lambda _e: None)

    stored = sessions._messages[1]
    assert not any(
        isinstance(m, HumanMessage) and isinstance(m.content, list) for m in stored
    ), "no image content blocks may stay in the history"
    assert any(isinstance(m, HumanMessage) and "picture no longer attached" in str(m.content) for m in stored)
    assert without_pictures(HumanMessage(content="plain")).content == "plain"
