Please insert everything related to file parsing here

## Setup

The Gerber parser (`parse-gbr-files.py`) is spawned as a subprocess by the
Electron main process (`src/main/ipc/parsing.ts`), so its dependencies must be
installed into whichever Python interpreter is on `PATH` as `python`
(Windows) / `python3` (macOS/Linux) — the same one Electron will spawn:

```
pip install -r requirements.txt
```
