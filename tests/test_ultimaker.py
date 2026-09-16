from src.main.motion_control.ultimaker import UltimakerMotion
from src.main.hardware_bridge import HardwareBridge


class FakeSerial:
    def __init__(self) -> None:
        self.is_open = True

    def close(self) -> None:
        self.is_open = False


class FakeMotion:
    def __init__(self, *, reachable: bool = True) -> None:
        self.printer = FakeSerial()
        self.reachable = reachable

    def is_reachable(self) -> bool:
        return self.reachable


def test_get_position_accepts_standard_marlin_spacing() -> None:
    motion = object.__new__(UltimakerMotion)
    motion._send_gcode = lambda _command: [
        "X: 10.25 Y:20.50 Z: 30.75 E:0.00 Count X:0 Y:0 Z:0"
    ]

    assert motion.get_position() == (10.25, 20.5, 30.75)


def test_get_position_accepts_ultimaker_response_without_axis_spacing() -> None:
    motion = object.__new__(UltimakerMotion)
    motion._send_gcode = lambda _command: [
        "X:0.00Y:224.50Z:218.35E:0.00 Count X: 0.00Y:224.50Z:218.35",
        "ok",
    ]

    assert motion.get_position() == (0.0, 224.5, 218.35)


def test_position_validation_keeps_probe_above_minimum_safe_z() -> None:
    motion = object.__new__(UltimakerMotion)

    try:
        motion._validate_position(10.0, 20.0, 9.9)
    except ValueError as error:
        assert "outside allowed range [10.0, 205.0]" in str(error)
    else:
        raise AssertionError("Unsafe Z position was accepted")


def test_hardware_bridge_keeps_connection_open_until_disconnect() -> None:
    motion = FakeMotion()
    bridge = HardwareBridge(lambda: motion)

    assert bridge.connect() == {"connected": True}
    assert motion.printer.is_open is True
    assert bridge.status() == {"connected": True}
    assert bridge.disconnect() == {"connected": False}
    assert motion.printer.is_open is False


def test_hardware_bridge_closes_unreachable_connection() -> None:
    motion = FakeMotion(reachable=False)
    bridge = HardwareBridge(lambda: motion)

    try:
        bridge.connect()
    except ConnectionError as error:
        assert "did not respond to M115" in str(error)
    else:
        raise AssertionError("Unreachable Ultimaker was accepted")

    assert motion.printer.is_open is False
