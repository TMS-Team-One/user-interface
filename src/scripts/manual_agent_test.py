"""Interactive manual test for the ProbePilot LangGraph agent."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from dotenv import load_dotenv


# Test prompt:
# I have multiple components on my PCB board: A=(50, 50, 30), B=(100, 50, 40), C=(200, 200, 30).
# Please go to component A first, then B, then C and measure the voltage at each component.


# Allow `python scripts/manual_agent_test.py` without installing the project.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.main.agent.graph import build_agent_graph  # noqa: E402
from src.main.agent.model import create_chat_model  # noqa: E402
from src.main.motion_control.ultimaker import UltimakerMotion  # noqa: E402
from src.main.tools.motion import create_motion_tools  # noqa: E402
from src.main.tools.registry import ToolRegistry  # noqa: E402
from src.main.tools.voltage import create_voltage_tools  # noqa: E402
from src.main.voltage_measurement import ADS1115VoltageMeter  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the ProbePilot agent.")
    parser.add_argument(
        "--arduino-port",
        help="Arduino serial port; omit to use automatic detection",
    )
    args = parser.parse_args()

    load_dotenv(PROJECT_ROOT / ".env")

    print("ProbePilot manual agent test")
    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is missing. Add it to the repository's .env file.")
        return

    print("WARNING: Tool calls can move the printer and perform measurements.")
    if input("Type 'yes' to connect to the hardware: ").strip().lower() != "yes":
        print("Cancelled.")
        return

    motion = UltimakerMotion()
    voltage_meter: ADS1115VoltageMeter | None = None
    try:
        print("Homing printer...")
        motion.home()
        print(f"Homing complete. Position: {motion.get_position()}")

        registry = ToolRegistry()
        registry.register_many(create_motion_tools(motion))
        voltage_meter = ADS1115VoltageMeter(port=args.arduino_port)
        registry.register_many(create_voltage_tools(voltage_meter))
        graph = build_agent_graph(create_chat_model(), registry)
        history = []

        print("Connected. Enter an instruction, or type 'exit' to stop.")
        while True:
            instruction = input("you> ").strip()
            if instruction.lower() in {"exit", "quit"}:
                break
            if not instruction:
                continue

            input_messages = [*history, HumanMessage(content=instruction)]
            result = graph.invoke({"messages": input_messages, "step_count": 0})
            history = result["messages"]

            for message in history[len(input_messages) :]:
                _print_message(message)
    except (EOFError, KeyboardInterrupt):
        print("\nStopped.")
    finally:
        if voltage_meter is not None:
            voltage_meter.close()
        if motion.printer.is_open:
            motion.printer.close()


def _print_message(message: object) -> None:
    if isinstance(message, AIMessage):
        for call in message.tool_calls:
            print(f"agent requested> {call['name']} {json.dumps(call['args'])}")
        if message.content:
            print(f"agent> {message.content}")
    elif isinstance(message, ToolMessage):
        print(f"tool[{message.name}]> {message.content}")


if __name__ == "__main__":
    main()
