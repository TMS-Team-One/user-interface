"""
Runs a probing job and streams what happens as JSON lines on stdout.

Input (stdin, one JSON document):
  {
    "targets": [{"index": 0, "x": 12.7, "y": 3.2, "label": "GND"}, ...],   board frame, mm
    "pose": {"x": 60.0, "y": 60.0, "z_contact": 12.0, "rotation_deg": 0.0},  where the board lies
    "located": {...},        optional: a scripts.locate_pcb result made with a bed calibration;
                             its board origin and angle replace pose.x, pose.y and pose.rotation_deg
    "safe_height": 8.0                                                      mm above z_contact for XY moves
  }

Options: --simulate never touches hardware; --time-scale S makes the simulated
head move S times slower than real time (0.1 = ten times faster).

Output events (one JSON object per line), coordinates in the board frame:
  {"type": "started", "targets": N, "backend": "ultimaker" | "simulated",
   "instrument": "ads1115" | "simulated"}
  {"type": "move", "x": .., "y": .., "z": .., "duration_ms": ..}   z is height above the board
  {"type": "target", "target": {...}}
  {"type": "contact", "target": {...}, "voltage": 3.3}
  {"type": "finished"}
  {"type": "error", "message": ".."}
"""
import argparse
import json
import math
import sys
import time

from src.measurement.instrument import ADS1115Instrument, SimulatedInstrument
from src.motion_control.simulated import SimulatedMotion


def emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def connect_motion(simulate: bool, time_scale: float):
    """The printer when it answers, otherwise the simulated head."""
    if not simulate:
        try:
            from src.motion_control.ultimaker import UltimakerMotion
            return UltimakerMotion(), "ultimaker"
        except Exception as error:  # no port, no answer: fall back
            emit({"type": "log", "message": f"printer not available ({error}); simulating"})
    return SimulatedMotion(time_scale=time_scale), "simulated"


def connect_instrument(simulate: bool):
    """The Arduino/ADS1115 meter when it is connected, otherwise made-up readings."""
    if not simulate:
        try:
            from src.voltage_measurement import ADS1115VoltageMeter
            return ADS1115Instrument(ADS1115VoltageMeter()), "ads1115"
        except Exception as error:
            emit({"type": "log", "message": f"voltage meter not available ({error}); simulating"})
    return SimulatedInstrument(), "simulated"


def pose_from_localisation(located: dict) -> dict:
    """Board origin and angle on the bed from a scripts.locate_pcb result."""
    pose = located.get("pose_on_bed")
    if not pose:
        raise ValueError("the localisation has no pose_on_bed; run locate_pcb with --bed")
    return {"x": pose["origin_xy"][0], "y": pose["origin_xy"][1], "rotation_deg": pose["angle_deg"]}


def run(job: dict, simulate: bool, time_scale: float) -> None:
    pose = job.get("pose", {"x": 0.0, "y": 0.0, "z_contact": 0.0, "rotation_deg": 0.0})
    if job.get("located"):
        pose = {**pose, **pose_from_localisation(job["located"])}
    safe_height = job.get("safe_height", 8.0)
    angle = math.radians(pose.get("rotation_deg", 0.0))
    cos_a, sin_a = math.cos(angle), math.sin(angle)

    def to_printer(x: float, y: float, height: float) -> tuple[float, float, float]:
        return (
            pose["x"] + x * cos_a - y * sin_a,
            pose["y"] + x * sin_a + y * cos_a,
            pose["z_contact"] + height,
        )

    motion, backend = connect_motion(simulate, time_scale)
    instrument, instrument_kind = connect_instrument(simulate)
    targets = job["targets"]
    emit({"type": "started", "targets": len(targets), "backend": backend,
          "instrument": instrument_kind})

    def move(x: float, y: float, height: float) -> None:
        started = time.monotonic()
        motion.move_to(*to_printer(x, y, height))
        emit({"type": "move", "x": x, "y": y, "z": height,
              "duration_ms": round((time.monotonic() - started) * 1000)})

    for target in targets:
        emit({"type": "target", "target": target})
        move(target["x"], target["y"], safe_height)
        move(target["x"], target["y"], 0.0)
        emit({"type": "contact", "target": target, "voltage": instrument.read_voltage()})
        move(target["x"], target["y"], safe_height)
    emit({"type": "finished"})


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a probing job read from stdin.")
    parser.add_argument("--simulate", action="store_true", help="never touch the hardware")
    parser.add_argument("--time-scale", type=float, default=1.0,
                        help="simulated move duration factor, 1 = real time")
    args = parser.parse_args()
    job = json.load(sys.stdin)
    try:
        run(job, args.simulate, args.time_scale)
    except Exception as error:
        emit({"type": "error", "message": str(error)})
        raise


if __name__ == "__main__":
    main()
