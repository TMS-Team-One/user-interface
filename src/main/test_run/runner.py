"""
Runs a probing job: visits every target pad at a safe height, lowers the probe,
reads the voltage and reports each step as an event.

Job (one JSON document):
  {
    "targets": [{"index": 0, "x": 12.7, "y": 3.2, "label": "GND"}, ...],   board frame, mm
    "pose": {"x": 60.0, "y": 60.0, "z_contact": 12.0, "rotation_deg": 0.0},  where the board lies
    "located": {...},        optional: a locate_pcb result made with a bed calibration;
                             its board origin and angle replace pose.x, pose.y and pose.rotation_deg
    "safe_height": 8.0                                                      mm above z_contact for XY moves
  }

Events (dicts, coordinates in the board frame):
  {"type": "started", "targets": N, "backend": "ultimaker" | "simulated",
   "instrument": "ads1115" | "simulated"}
  {"type": "move", "x": .., "y": .., "z": .., "duration_ms": ..}   z is height above the board
  {"type": "target", "target": {...}}
  {"type": "contact", "target": {...}, "voltage": 3.3}
  {"type": "finished"}                                              also after a stop
  {"type": "log", "message": ".."}

The hardware bridge runs jobs with its own connections; scripts.run_test runs one
from the command line with the printer and meter it finds, or simulated ones.
"""
import math
import time
from collections.abc import Callable

from src.main.measurement.instrument import ADS1115Instrument, SimulatedInstrument
from src.main.motion_control.simulated import SimulatedMotion

Emitter = Callable[[dict], None]


def connect_motion(simulate: bool, time_scale: float, emit: Emitter):
    """The printer when it answers, otherwise the simulated head."""
    if not simulate:
        try:
            from src.main.motion_control.ultimaker import UltimakerMotion
            return UltimakerMotion(), "ultimaker"
        except Exception as error:  # no port, no answer: fall back
            emit({"type": "log", "message": f"printer not available ({error}); simulating"})
    return SimulatedMotion(time_scale=time_scale), "simulated"


def connect_instrument(simulate: bool, emit: Emitter):
    """The Arduino/ADS1115 meter when it is connected, otherwise made-up readings."""
    if not simulate:
        try:
            from src.main.voltage_measurement import ADS1115VoltageMeter
            return ADS1115Instrument(ADS1115VoltageMeter()), "ads1115"
        except Exception as error:
            emit({"type": "log", "message": f"voltage meter not available ({error}); simulating"})
    return SimulatedInstrument(), "simulated"


def pose_from_localisation(located: dict) -> dict:
    """Board origin and angle on the bed from a locate_pcb result."""
    pose = located.get("pose_on_bed")
    if not pose:
        raise ValueError("the localisation has no pose_on_bed; run locate_pcb with --bed")
    return {"x": pose["origin_xy"][0], "y": pose["origin_xy"][1], "rotation_deg": pose["angle_deg"]}


def run_job(
    job: dict,
    motion,
    backend: str,
    instrument,
    instrument_kind: str,
    emit: Emitter,
    should_stop: Callable[[], bool] = lambda: False,
) -> None:
    """Visit every target with the given motion and instrument; stops between moves."""
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

    targets = job["targets"]
    emit({"type": "started", "targets": len(targets), "backend": backend,
          "instrument": instrument_kind})

    def move(x: float, y: float, height: float) -> None:
        started = time.monotonic()
        motion.move_to(*to_printer(x, y, height))
        emit({"type": "move", "x": x, "y": y, "z": height,
              "duration_ms": round((time.monotonic() - started) * 1000)})

    for target in targets:
        if should_stop():
            break
        emit({"type": "target", "target": target})
        move(target["x"], target["y"], safe_height)
        move(target["x"], target["y"], 0.0)
        emit({"type": "contact", "target": target, "voltage": instrument.read_voltage()})
        move(target["x"], target["y"], safe_height)
    emit({"type": "finished"})
