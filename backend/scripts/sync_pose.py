"""Board pose on the bed from one pad the probe was put on; see src/vision/sync.py.

    python3 -m scripts.sync_pose < '{"located": {...}, "pad_board_xy": [x, y], "printer_xyz": [x, y, z]}'

Prints the pose as JSON for a probing job.
"""
import json
import sys

from src.vision.sync import pose_from_sync


def main() -> None:
    request = json.load(sys.stdin)
    try:
        pose = pose_from_sync(request["located"], request["pad_board_xy"], request["printer_xyz"])
    except (KeyError, ValueError) as error:
        sys.exit(f"error: {error}")
    print(json.dumps(pose))


if __name__ == "__main__":
    main()
