import pytest

from src.main.motion_control.ultimaker import UltimakerMotion
from src.main.hardware_bridge import HardwareBridge
from src.main.voltage_measurement import (
    VoltageMeasurementError,
    VoltageMeterConnectionError,
)


class FakeSerial:
    def __init__(self) -> None:
        self.is_open = True

    def close(self) -> None:
        self.is_open = False


class FakeMotion:
    SAFE_Z = 50.0

    def __init__(self, *, reachable: bool = True) -> None:
        self.printer = FakeSerial()
        self.reachable = reachable
        self.position = (0.0, 0.0, self.SAFE_Z)
        self.moves: list[tuple[float, float, float]] = []
        self.home_calls = 0

    def is_reachable(self) -> bool:
        return self.reachable

    def home(self) -> None:
        self.home_calls += 1
        self.position = (0.0, 0.0, 205.0)

    def get_position(self) -> tuple[float, float, float]:
        return self.position

    def move_to(self, x: float, y: float, z: float) -> None:
        self.moves.append((x, y, z))
        self.position = (x, y, z)


class FakeVoltageMeter:
    def __init__(self, voltage: float = 3.3, error: Exception | None = None) -> None:
        self.voltage = voltage
        self.error = error
        self.measure_calls: list[dict[str, object]] = []
        self.closed = False

    def measure_voltage(self, **kwargs: object) -> float:
        self.measure_calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.voltage

    def close(self) -> None:
        self.closed = True


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

    assert bridge.connect() == {"connected": True, "homed": False}
    assert motion.printer.is_open is True
    assert bridge.status() == {"connected": True, "homed": False}
    assert bridge.disconnect() == {"connected": False, "homed": False}
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


def test_manual_test_requires_homing() -> None:
    motion = FakeMotion()
    bridge = HardwareBridge(lambda: motion, FakeVoltageMeter)
    bridge.connect()

    try:
        bridge.run_manual_test({"x": 10.0, "y": 20.0, "z": 30.0})
    except RuntimeError as error:
        assert "Home the Ultimaker" in str(error)
    else:
        raise AssertionError("Manual movement was accepted before homing")


def test_manual_test_moves_measures_and_retracts() -> None:
    motion = FakeMotion()
    voltage_meter = FakeVoltageMeter(voltage=3.287)
    bridge = HardwareBridge(lambda: motion, lambda: voltage_meter)

    bridge.connect()
    home_result = bridge.home()
    result = bridge.run_manual_test({"x": 10, "y": 20.0, "z": 15.5})

    assert home_result["homed"] is True
    assert motion.home_calls == 1
    assert motion.moves == [(10.0, 20.0, 15.5), (10.0, 20.0, 50.0)]
    assert len(voltage_meter.measure_calls) == 1
    assert result == {
        "target": {"x": 10.0, "y": 20.0, "z": 15.5},
        "voltage": 3.287,
        "unit": "V",
        "retracted": True,
    }

    bridge.disconnect()
    assert voltage_meter.closed is True


def test_manual_test_retracts_and_discards_meter_when_connection_is_lost() -> None:
    motion = FakeMotion()
    voltage_meter = FakeVoltageMeter(
        error=VoltageMeterConnectionError(
            "Voltage meter connection was lost. Reconnect the Arduino and try again."
        )
    )
    bridge = HardwareBridge(lambda: motion, lambda: voltage_meter)
    bridge.connect()
    bridge.home()

    try:
        bridge.run_manual_test({"x": 10, "y": 20, "z": 15})
    except VoltageMeterConnectionError as error:
        assert "connection was lost" in str(error)
    else:
        raise AssertionError("Failed voltage measurement was accepted")

    assert motion.moves == [(10.0, 20.0, 15.0), (10.0, 20.0, 50.0)]
    assert voltage_meter.closed is True


def test_manual_test_reconnects_voltage_meter_after_failure() -> None:
    motion = FakeMotion()
    disconnected_meter = FakeVoltageMeter(
        error=VoltageMeterConnectionError("Voltage meter connection was lost")
    )
    reconnected_meter = FakeVoltageMeter(voltage=2.5)
    meters = iter((disconnected_meter, reconnected_meter))
    bridge = HardwareBridge(lambda: motion, lambda: next(meters))
    bridge.connect()
    bridge.home()

    try:
        bridge.run_manual_test({"x": 10, "y": 20, "z": 15})
    except VoltageMeterConnectionError:
        pass
    else:
        raise AssertionError("Disconnected voltage meter was accepted")

    result = bridge.run_manual_test({"x": 10, "y": 20, "z": 15})

    assert disconnected_meter.closed is True
    assert result["voltage"] == 2.5


def test_manual_test_reports_missing_voltage_meter_without_moving() -> None:
    motion = FakeMotion()

    def missing_voltage_meter() -> FakeVoltageMeter:
        raise VoltageMeterConnectionError(
            "Voltage meter not found. Connect the Arduino/ADS1115 and try again."
        )

    bridge = HardwareBridge(lambda: motion, missing_voltage_meter)
    bridge.connect()
    bridge.home()

    try:
        bridge.run_manual_test({"x": 10, "y": 20, "z": 15})
    except VoltageMeterConnectionError as error:
        assert "Voltage meter not found" in str(error)
    else:
        raise AssertionError("Missing voltage meter was accepted")

    assert motion.moves == []


def test_manual_test_reports_unstable_voltage_separately() -> None:
    motion = FakeMotion()
    voltage_meter = FakeVoltageMeter(
        error=TimeoutError("Voltage did not stabilize within 7 seconds")
    )
    bridge = HardwareBridge(lambda: motion, lambda: voltage_meter)
    bridge.connect()
    bridge.home()

    try:
        bridge.run_manual_test({"x": 10, "y": 20, "z": 15})
    except VoltageMeasurementError as error:
        assert "Check the probe contact" in str(error)
    else:
        raise AssertionError("Unstable voltage was accepted")


def test_manual_test_rejects_non_finite_coordinates() -> None:
    motion = FakeMotion()
    bridge = HardwareBridge(lambda: motion, FakeVoltageMeter)
    bridge.connect()
    bridge.home()

    try:
        bridge.run_manual_test({"x": float("nan"), "y": 20, "z": 15})
    except ValueError as error:
        assert "X must be finite" in str(error)
    else:
        raise AssertionError("Non-finite coordinate was accepted")


def probing_job(targets: int = 1) -> dict:
    return {
        "targets": [
            {"index": index, "x": 1.0 + index, "y": 2.0, "label": f"pad {index}"}
            for index in range(targets)
        ],
        "pose": {"x": 10.0, "y": 10.0, "z_contact": 5.0, "rotation_deg": 0.0},
        "safe_height": 8.0,
        "time_scale": 0,
    }


def test_run_test_simulates_without_a_printer_and_streams_events() -> None:
    bridge = HardwareBridge(FakeMotion, FakeVoltageMeter)
    events: list[dict] = []

    result = bridge.run_test(probing_job(), events.append)

    assert events[0] == {
        "type": "started",
        "targets": 1,
        "backend": "simulated",
        "instrument": "simulated",
    }
    assert [event["type"] for event in events] == [
        "started", "target", "move", "move", "contact", "move", "finished",
    ]
    assert result == {"stopped": False}


def test_run_test_uses_the_connected_printer_and_requires_homing() -> None:
    motion = FakeMotion()
    voltage_meter = FakeVoltageMeter(voltage=1.25)
    bridge = HardwareBridge(lambda: motion, lambda: voltage_meter)
    bridge.connect()

    with pytest.raises(RuntimeError, match="Home the Ultimaker"):
        bridge.run_test(probing_job(), lambda _event: None)

    bridge.home()
    events: list[dict] = []
    bridge.run_test(probing_job(), events.append)

    assert events[0]["backend"] == "ultimaker"
    assert events[0]["instrument"] == "ads1115"
    contact = next(event for event in events if event["type"] == "contact")
    assert contact["voltage"] == 1.25
    # pose (10, 10) plus target (1, 2): contact at z_contact, then back to safe height
    assert motion.moves[-2:] == [(11.0, 12.0, 5.0), (11.0, 12.0, 13.0)]


def test_stop_run_ends_after_the_current_target() -> None:
    bridge = HardwareBridge(FakeMotion, FakeVoltageMeter)
    events: list[dict] = []

    def emit(event: dict) -> None:
        events.append(event)
        if event["type"] == "contact":
            bridge.stop_run()

    result = bridge.run_test(probing_job(targets=3), emit)

    assert result == {"stopped": True}
    assert sum(event["type"] == "target" for event in events) == 1
    assert events[-1]["type"] == "finished"


def test_hardware_requests_are_refused_during_a_run() -> None:
    motion = FakeMotion()
    bridge = HardwareBridge(lambda: motion, FakeVoltageMeter)
    bridge.connect()
    bridge.home()

    assert bridge._run_lock.acquire(blocking=False)
    try:
        assert bridge.status() == {"connected": True, "homed": True}
        with pytest.raises(RuntimeError, match="in progress"):
            bridge.home()
        with pytest.raises(RuntimeError, match="in progress"):
            bridge.run_manual_test({"x": 10, "y": 20, "z": 15})
        with pytest.raises(RuntimeError, match="already in progress"):
            bridge.run_test(probing_job(), lambda _event: None)
    finally:
        bridge._run_lock.release()
