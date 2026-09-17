Please insert everything related to file parsing here

## Setup

The Gerber parser CLI (`parse-gbr-files.py`) delegates to the importable
`gerber_parser.py` module. It is spawned as a subprocess by the Electron main
process (`src/main/ipc/parsing.ts`), while the agent file tools import the same
implementation directly. Its dependencies must be
installed into whichever Python interpreter is on `PATH` as `python`
(Windows) / `python3` (macOS/Linux) — the same one Electron will spawn:

```
pip install -r requirements.txt
```
