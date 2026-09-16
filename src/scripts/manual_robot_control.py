from src.motion_control.ultimaker import UltimakerMotion


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

