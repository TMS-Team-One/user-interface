"""Streams a probing job's events; see src/test_run/runner.py for the formats.

    python3 scripts/run_test.py [--simulate] < job.json
"""
from src.test_run.runner import main

if __name__ == "__main__":
    main()
