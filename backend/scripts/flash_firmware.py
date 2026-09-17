"""Compile a sketch for the Arduino UNO R4 Minima and upload it, nothing else.

    python3 -m scripts.flash_firmware [SKETCH_DIR] [--port PORT] [--fqbn FQBN]

The sketch is only ever compiled for the board and uploaded to it; nothing it
produces is executed on this computer. Without --port the meter's port is found
the same way the rest of ProbePilot finds it (src/serial_ports.py).
"""
import argparse
import shutil
import subprocess
import sys

from src.serial_ports import SerialDevice, get_port

DEFAULT_SKETCH = "firmware/ads1115_meter"
DEFAULT_FQBN = "arduino:renesas_uno:minima"


def main() -> None:
    parser = argparse.ArgumentParser(description="Compile and upload Arduino firmware.")
    parser.add_argument("sketch", nargs="?", default=DEFAULT_SKETCH, help="sketch folder")
    parser.add_argument("--port", help="serial port of the board; discovered when omitted")
    parser.add_argument("--fqbn", default=DEFAULT_FQBN, help="board identifier for arduino-cli")
    args = parser.parse_args()

    if shutil.which("arduino-cli") is None:
        sys.exit("arduino-cli is not installed; see .claude/skills/arduino-flash/SKILL.md")
    port = args.port or get_port(SerialDevice.VOLTAGE_METER)

    for step in (
        ["arduino-cli", "compile", "--fqbn", args.fqbn, args.sketch],
        ["arduino-cli", "upload", "--port", port, "--fqbn", args.fqbn, args.sketch],
    ):
        print("$", " ".join(step))
        if subprocess.run(step).returncode != 0:
            sys.exit(f"{step[1]} failed")
    print(f"Uploaded {args.sketch} to {port}.")


if __name__ == "__main__":
    main()
