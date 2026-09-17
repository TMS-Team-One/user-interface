import serial

from src.main.voltage_measurement import (
    ADS1115VoltageMeter,
    VoltageMeasurementError,
    VoltageMeterConnectionError,
)


class FakeArduino:
    def __init__(
        self,
        *,
        lines: list[bytes] | None = None,
        read_error: Exception | None = None,
        reset_error: Exception | None = None,
    ) -> None:
        self.is_open = True
        self.lines = iter(lines or [])
        self.read_error = read_error
        self.reset_error = reset_error

    def reset_input_buffer(self) -> None:
        if self.reset_error is not None:
            raise self.reset_error

    def readline(self) -> bytes:
        if self.read_error is not None:
            raise self.read_error
        return next(self.lines, b"")

    def close(self) -> None:
        self.is_open = False


def test_voltage_meter_reports_serial_disconnect_during_read() -> None:
    arduino = FakeArduino(read_error=serial.SerialException("device disappeared"))
    meter = ADS1115VoltageMeter(connection=arduino)

    try:
        meter.measure_voltage(duration=0.1, max_wait=0.3)
    except VoltageMeterConnectionError as error:
        assert "connection was lost" in str(error)
    else:
        raise AssertionError("Serial disconnect was not reported")


def test_voltage_meter_reports_serial_disconnect_while_clearing_buffer() -> None:
    arduino = FakeArduino(reset_error=OSError("device disappeared"))
    meter = ADS1115VoltageMeter(connection=arduino)

    try:
        meter.measure_voltage(duration=0.1, max_wait=0.3)
    except VoltageMeterConnectionError as error:
        assert "connection was lost" in str(error)
    else:
        raise AssertionError("Serial disconnect was not reported")


def test_voltage_meter_reports_missing_ads1115_separately() -> None:
    arduino = FakeArduino(lines=[b"ADS1115 not connected\n"])
    meter = ADS1115VoltageMeter(connection=arduino)

    try:
        meter.measure_voltage(duration=0.1, max_wait=0.3)
    except VoltageMeasurementError as error:
        assert "ADS1115 is not detected" in str(error)
    else:
        raise AssertionError("Missing ADS1115 was not reported")
