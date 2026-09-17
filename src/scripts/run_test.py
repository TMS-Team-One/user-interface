"""Run a probing job read from stdin; events as JSON lines on stdout.

    python3 -m src.scripts.run_test [--simulate] [--time-scale S] < job.json

The job and event formats are documented in src/main/test_run/runner.py.
--simulate never touches hardware; --time-scale S makes the simulated head move S
times slower than real time (0.1 = ten times faster).
"""
import argparse
import json
import sys

from src.main.test_run.runner import connect_instrument, connect_motion, run_job


def emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a probing job read from stdin.")
    parser.add_argument("--simulate", action="store_true", help="never touch the hardware")
    parser.add_argument("--time-scale", type=float, default=1.0,
                        help="simulated move duration factor, 1 = real time")
    args = parser.parse_args()
    job = json.load(sys.stdin)
    motion, backend = connect_motion(args.simulate, args.time_scale, emit)
    instrument, instrument_kind = connect_instrument(args.simulate, emit)
    try:
        run_job(job, motion, backend, instrument, instrument_kind, emit)
    except Exception as error:
        emit({"type": "error", "message": str(error)})
        raise


if __name__ == "__main__":
    main()
