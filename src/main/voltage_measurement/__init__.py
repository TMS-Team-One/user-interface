"""Voltage measurement hardware integrations."""

from .ads1115 import (
    ADS1115VoltageMeter,
    VoltageMeasurementError,
    VoltageMeterConnectionError,
    VoltageReading,
)

__all__ = [
    "ADS1115VoltageMeter",
    "VoltageMeasurementError",
    "VoltageMeterConnectionError",
    "VoltageReading",
]
