"""Answer one chat turn about a project with the ProbePilot LangGraph agent.

    python3 -m scripts.chat [--dry-run] < request.json

Request: {"messages": [{"role": "user" | "assistant", "content": "..."}, ...],
          "context": {"name": ..., "files": [...], "pads": [...], "last_run": ..., "pose": ...}}
The last message is the user's question. Events on stdout, one JSON per line:
  {"type": "tool", "name": ..., "args": {...}}     each tool the agent used
  {"type": "reply", "text": "..."}                 the answer
  {"type": "error", "message": "..."}
--dry-run answers with a fixed model so the wiring can be checked without a key.
"""
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage

from src.agent.graph import DEFAULT_SYSTEM_PROMPT, build_agent_graph
from src.agent.model import create_chat_model
from src.tools.project import create_project_tools
from src.tools.registry import ToolRegistry

PROJECT_ROOT = Path(__file__).resolve().parents[1]

SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT + """
You are talking to the operator inside the ProbePilot desktop app. Use the
project tools to look at the board before answering questions about it, answer
briefly, and say when something is not known yet.
"""


def emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def create_model(dry_run: bool):
    if dry_run:
        from langchain_core.language_models.fake_chat_models import FakeMessagesListChatModel

        class FixedAnswerModel(FakeMessagesListChatModel):
            def bind_tools(self, tools, **kwargs):  # the graph binds tools; the answer stays fixed
                return self

        return FixedAnswerModel(responses=[AIMessage(content="Dry run: the agent wiring works.")])
    load_dotenv(PROJECT_ROOT / ".env")
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is missing; add it to backend/.env")
    return create_chat_model()


def main() -> None:
    parser = argparse.ArgumentParser(description="One chat turn with the ProbePilot agent.")
    parser.add_argument("--dry-run", action="store_true", help="fixed answer, no model call")
    args = parser.parse_args()
    request = json.load(sys.stdin)

    try:
        registry = ToolRegistry()
        registry.register_many(create_project_tools(request.get("context", {})))
        graph = build_agent_graph(create_model(args.dry_run), registry, system_prompt=SYSTEM_PROMPT)
        history = [
            HumanMessage(content=m["content"]) if m["role"] == "user" else AIMessage(content=m["content"])
            for m in request["messages"]
        ]
        result = graph.invoke({"messages": history, "step_count": 0})
    except Exception as error:
        emit({"type": "error", "message": f"{type(error).__name__}: {error}"})
        sys.exit(1)

    reply = ""
    for message in result["messages"][len(history):]:
        if isinstance(message, AIMessage):
            for call in message.tool_calls:
                emit({"type": "tool", "name": call["name"], "args": call["args"]})
            if message.content:
                reply = message.content if isinstance(message.content, str) else str(message.content)
    emit({"type": "reply", "text": reply})


if __name__ == "__main__":
    main()
