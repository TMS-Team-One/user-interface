"""Voltage measurement hardware integrations."""

from .ads1115 import ADS1115VoltageMeter, VoltageReading

__all__ = ["ADS1115VoltageMeter", "VoltageReading"]
