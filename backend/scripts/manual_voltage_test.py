"""Continuously print ADS1115 readings for a manual hardware test."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import serial


# Allow `python scripts/manual_voltage_test.py` without installing the project.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.voltage_measurement import ADS1115VoltageMeter  # noqa: E402


R_TOP_OHMS = 10_000.0
R_BOTTOM_OHMS = 5_100.0
VOLTAGE_DIVIDER_SCALE = (R_TOP_OHMS + R_BOTTOM_OHMS) / R_BOTTOM_OHMS


def main() -> None:
    parser = argparse.ArgumentParser(description="Read voltages from the Arduino.")
    parser.add_argument(
        "port",
        nargs="?",
        help="Arduino serial port, for example /dev/cu.usbmodem1101",
    )
    parser.add_argument(
        "--stability-window",
        "--median-interval",
        dest="stability_window",
        type=float,
        default=1.0,
        help="seconds per stability window (default: 1)",
    )
    parser.add_argument(
        "--max-wait",
        type=float,
        default=7.0,
        help="maximum seconds to wait for convergence (default: 7)",
    )
    args = parser.parse_args()
    if args.stability_window <= 0:
        parser.error("--stability-window must be greater than zero")
    if args.max_wait <= 2 * args.stability_window:
        parser.error("--max-wait must exceed two stability windows")

    try:
        with ADS1115VoltageMeter(port=args.port) as meter:
            print("Connected. Press Ctrl+C to stop.")
            while True:
                voltage = meter.measure_voltage(
                    duration=args.stability_window,
                    max_wait=args.max_wait,
                    scale=VOLTAGE_DIVIDER_SCALE,
                )
                print(f"Voltage: {voltage:.3f} V")
    except KeyboardInterrupt:
        print("\nStopped.")
    except (RuntimeError, TimeoutError, serial.SerialException) as error:
        raise SystemExit(f"Measurement failed: {error}") from error


if __name__ == "__main__":
    main()
