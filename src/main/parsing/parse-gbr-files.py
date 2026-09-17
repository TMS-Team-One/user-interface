"""CLI compatibility wrapper for the importable Gerber parser."""

from __future__ import annotations

import json
import sys
from dataclasses import asdict
from pathlib import Path

try:
    from src.main.parsing.gerber_parser import main
except ModuleNotFoundError as error:
    if error.name != "src":
        raise
    # Direct script execution adds only this file's directory to sys.path.
    # Development launches the parser by path, so add the repository root.
    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
    from src.main.parsing.gerber_parser import main


if __name__ == "__main__":
    if not sys.stdin.isatty():
        gbr_content = sys.stdin.read()
        args = [arg for arg in sys.argv[1:] if not arg.startswith("--")]
        filename = args[0] if args else None
        result = main(
            gbr_content,
            filename=filename,
            copper_only="--all-flashes" not in sys.argv,
        )
        print(json.dumps(asdict(result)))
    else:
        for pad in main().pads:
            print(pad)
