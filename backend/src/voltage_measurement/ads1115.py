"""Read ADS1115 voltage measurements streamed by an Arduino over serial."""

from __future__ import annotations

import math
import re
import threading
from dataclasses import dataclass
from statistics import median
from time import monotonic
from typing import Any

import serial

from src.serial_ports import SerialDevice, get_port


BAUD_RATE = 115_200
CHANNELS = frozenset(range(4))

_READING_PATTERN = re.compile(
    r"^Kanal\s+(?P<channel>\d+):\s*"
    r"(?P<raw>-?\d+)\s*\|\s*"
    r"(?P<voltage>-?(?:\d+(?:\.\d*)?|\.\d+))\s*V$"
)


@dataclass(frozen=True, slots=True)
class VoltageReading:
    """One single-ended ADS1115 channel reading."""

    channel: int
    raw: int
    voltage: float


def _create_connection(port: str | None, read_timeout: float) -> serial.Serial:
    """Open the Arduino serial connection."""
    if read_timeout <= 0:
        raise ValueError("read_timeout must be greater than zero")

    return serial.Serial(
        port=port or get_port(SerialDevice.VOLTAGE_METER),
        baudrate=BAUD_RATE,
        timeout=read_timeout,
    )


class ADS1115VoltageMeter:
    """Consume the continuous four-channel stream produced by the Arduino."""

    def __init__(self, port: str | None = None, *, read_timeout: float = 0.1, connection: Any | None = None) -> None:
        """Connect to the Arduino, or use an injected serial-like connection."""
        self.arduino = connection or _create_connection(port, read_timeout)
        self._lock = threading.Lock()

    def measure_voltage(
        self,
        *,
        duration: float = 0.5,
        max_wait: float = 7.0,
        scale: float = 1.0,
        absolute: bool = True,
        stability_tolerance: float = 0.1,
        trend_tolerance: float = 0.02,
    ) -> float:
        """Wait for a stable CH0-to-CH1 voltage and return its median.

        Measurements are grouped into consecutive windows of ``duration``
        seconds. A result is returned when two neighboring windows are quiet
        and their medians differ by no more than ``trend_tolerance``.
        ``stability_tolerance`` limits the peak-to-peak variation within each
        window. Both tolerances apply after scaling and are expressed in volts.
        ``max_wait`` bounds the total measurement time.
        """
        self._validate_timeout(duration)
        self._validate_timeout(max_wait)
        if max_wait <= 2 * duration:
            raise ValueError("max_wait must exceed two measurement windows")
        if not math.isfinite(scale) or scale <= 0:
            raise ValueError("scale must be a finite number greater than zero")
        for name, tolerance in (
            ("stability_tolerance", stability_tolerance),
            ("trend_tolerance", trend_tolerance),
        ):
            if not math.isfinite(tolerance) or tolerance < 0:
                raise ValueError(f"{name} must be a finite, non-negative number")

        minimum_samples = 3
        previous_values: list[float] | None = None
        received_pair = False

        with self._lock:
            # Ignore measurements buffered before the probe was placed or moved.
            reset_input_buffer = getattr(self.arduino, "reset_input_buffer", None)
            if callable(reset_input_buffer):
                reset_input_buffer()

            deadline = monotonic() + max_wait
            window_started = monotonic()
            window_values: list[float] = []
            ch0_voltage: float | None = None

            while monotonic() < deadline:
                try:
                    reading = self._next_reading(deadline)
                except TimeoutError:
                    break

                if reading.channel == 0:
                    ch0_voltage = reading.voltage
                elif reading.channel == 1 and ch0_voltage is not None:
                    # The firmware scans CH0 then CH1, so these values belong to
                    # the same measurement cycle and should be evaluated together.
                    window_values.append((ch0_voltage - reading.voltage) * scale)
                    ch0_voltage = None
                    received_pair = True

                now = monotonic()
                if now - window_started < duration:
                    continue

                # Peak-to-peak variation detects noise within a window; comparing
                # window medians below detects a signal that is still drifting.
                current_is_quiet = (
                    len(window_values) >= minimum_samples
                    and max(window_values) - min(window_values)
                    <= stability_tolerance
                )
                previous_is_quiet = (
                    previous_values is not None
                    and len(previous_values) >= minimum_samples
                    and max(previous_values) - min(previous_values)
                    <= stability_tolerance
                )

                if current_is_quiet and previous_is_quiet:
                    current_median = median(window_values)
                    previous_median = median(previous_values)
                    if abs(current_median - previous_median) <= trend_tolerance:
                        result = median([*previous_values, *window_values])
                        return abs(result) if absolute else result

                # Keep only a quiet window as a convergence candidate. A noisy
                # window therefore resets the requirement for two stable windows.
                previous_values = window_values if current_is_quiet else None
                window_values = []
                window_started = now

        if not received_pair:
            raise TimeoutError("No complete CH0/CH1 measurement pair received")
        raise TimeoutError(f"Voltage did not stabilize within {max_wait:g} seconds")


    def close(self) -> None:
        """Close the serial connection."""
        if getattr(self.arduino, "is_open", True):
            self.arduino.close()


    # --- Private methods ---

    @staticmethod
    def _parse_reading(line: str) -> VoltageReading | None:
        match = _READING_PATTERN.fullmatch(line.strip())
        if match is None:
            return None

        reading = VoltageReading(
            channel=int(match.group("channel")),
            raw=int(match.group("raw")),
            voltage=float(match.group("voltage")),
        )
        if reading.channel not in CHANNELS:
            raise RuntimeError(f"Arduino returned invalid channel {reading.channel}")
        if not -32_768 <= reading.raw <= 32_767:
            raise RuntimeError(f"Arduino returned invalid raw value {reading.raw}")
        if not math.isfinite(reading.voltage):
            raise RuntimeError("Arduino returned a non-finite voltage")
        return reading

    @staticmethod
    def _raise_for_device_error(line: str) -> None:
        if "ADS1115 not connected" in line:
            raise RuntimeError("Arduino reports that the ADS1115 is not connected")
        if "ADS1115 initialization failed" in line:
            raise RuntimeError(line)
        if line.startswith("Fehler beim Lesen von Kanal"):
            raise RuntimeError(f"Arduino measurement failed: {line}")

    def _next_reading(self, deadline: float) -> VoltageReading:
        while monotonic() < deadline:
            raw_line = self.arduino.readline()
            if not raw_line:
                continue

            if isinstance(raw_line, bytes):
                line = raw_line.decode("utf-8", errors="replace").strip()
            else:
                line = str(raw_line).strip()

            self._raise_for_device_error(line)
            reading = self._parse_reading(line)
            if reading is not None:
                return reading

        raise TimeoutError("No ADS1115 measurement received before the timeout")

    @staticmethod
    def _validate_timeout(timeout: float) -> None:
        if timeout <= 0:
            raise ValueError("timeout must be greater than zero")

    @staticmethod
    def _validate_channel(channel: int) -> None:
        if (
            not isinstance(channel, int)
            or isinstance(channel, bool)
            or channel not in CHANNELS
        ):
            raise ValueError("channel must be an integer from 0 to 3")

    def _measure_channel(self, channel: int, *, timeout: float = 3.0) -> VoltageReading:
        """Wait for and return the next reading for one channel."""
        self._validate_channel(channel)
        self._validate_timeout(timeout)
        deadline = monotonic() + timeout

        with self._lock:
            while True:
                reading = self._next_reading(deadline)
                if reading.channel == channel:
                    return reading

    def _measure_all_channels(self, *, timeout: float = 3.0) -> dict[int, VoltageReading]:
        """Return one reading for each of the four channels."""
        self._validate_timeout(timeout)
        deadline = monotonic() + timeout
        readings: dict[int, VoltageReading] = {}

        with self._lock:
            while len(readings) < len(CHANNELS):
                reading = self._next_reading(deadline)
                readings[reading.channel] = reading

        return dict(sorted(readings.items()))

    def _is_reachable(self, *, timeout: float = 3.0) -> bool:
        """Return whether the Arduino produces a valid ADS1115 reading."""
        self._validate_timeout(timeout)
        try:
            with self._lock:
                self._next_reading(monotonic() + timeout)
            return True
        except (RuntimeError, TimeoutError, serial.SerialException):
            return False

    def __enter__(self) -> ADS1115VoltageMeter:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()
