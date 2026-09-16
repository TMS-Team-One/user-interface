from __future__ import annotations

from typing import Protocol

from langchain_core.tools import BaseTool, tool


DEFAULT_VOLTAGE_DIVIDER_SCALE = (10_000 + 5_100) / 5_100


class VoltageMeter(Protocol):
    """The subset of ADS1115VoltageMeter used by the agent tool."""

    def measure_voltage(
        self,
        *,
        duration: float = 0.5,
        max_wait: float = 7.0,
        scale: float = 1.0,
        absolute: bool = True,
    ) -> float: ...


def create_voltage_tools(
    voltage_meter: VoltageMeter,
    *,
    stability_window: float = 0.5,
    max_wait: float = 7.0,
    scale: float = DEFAULT_VOLTAGE_DIVIDER_SCALE,
) -> list[BaseTool]:
    """Create tools bound to one voltage-meter instance."""

    @tool("measure_voltage")
    def measure_voltage() -> dict:
        """Wait for a stable voltage magnitude between probe channels CH0 and CH1."""
        voltage = voltage_meter.measure_voltage(
            duration=stability_window,
            max_wait=max_wait,
            scale=scale,
            absolute=True,
        )
        return {"voltage": voltage, "unit": "V"}

    return [measure_voltage]
