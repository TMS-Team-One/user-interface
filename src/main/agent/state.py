from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages
from typing_extensions import Annotated, NotRequired, TypedDict


class AgentState(TypedDict):
    """
    - messages: stores messages + tool results
    - step_count: prevents infinite model/tool loops (max 10 steps by default)
    - guard_error: records why tool request was rejected
    """
    messages: Annotated[list[AnyMessage], add_messages]
    step_count: NotRequired[int]
    guard_error: NotRequired[str | None]
    test_context: NotRequired[str]
