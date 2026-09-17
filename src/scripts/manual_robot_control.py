import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.main.motion_control.ultimaker import UltimakerMotion  # noqa: E402


def manual_move(motion: UltimakerMotion) -> None:
    try:
        x = float(input("X: "))
        y = float(input("Y: "))
        z = float(input("Z: "))

        motion.move_to(x, y, z)
        print("Move completed successfully.")

    except Exception as e:
        print(f"Move failed: {e}")


if __name__ == "__main__":
    printer = UltimakerMotion()

    printer.home()
    print(printer.get_position())

    while True:
        manual_move(printer)
        print(printer.get_position())
