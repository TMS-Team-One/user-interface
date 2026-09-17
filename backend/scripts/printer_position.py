"""Print the printer's current position as JSON, for the camera sync.

    python3 -m scripts.printer_position
"""
import json
import sys

from src.motion_control.ultimaker import UltimakerMotion


def main() -> None:
    try:
        motion = UltimakerMotion()
        x, y, z = motion.get_position()
    except Exception as error:
        sys.exit(f"error: {error}")
    print(json.dumps({"x": x, "y": y, "z": z}))


if __name__ == "__main__":
    main()
