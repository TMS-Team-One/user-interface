import random

# Resistors of the probe's voltage divider, as in scripts/manual_voltage_test.py.
R_TOP_OHMS = 10_000.0
R_BOTTOM_OHMS = 5_100.0
VOLTAGE_DIVIDER_SCALE = (R_TOP_OHMS + R_BOTTOM_OHMS) / R_BOTTOM_OHMS


class ADS1115Instrument:
    """The Arduino + ADS1115 meter, read once per pad after the probe has settled."""

    def __init__(self, meter, scale: float = VOLTAGE_DIVIDER_SCALE):
        self.meter = meter
        self.scale = scale

    def read_voltage(self) -> float:
        return self.meter.measure_voltage(scale=self.scale)


class SimulatedInstrument:
    """Stand-in when the meter is not connected: returns a made-up voltage."""

    def read_voltage(self) -> float:
        return round(random.uniform(0.0, 5.0), 2)
