# thinkmakestart-ui

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
$ python3 -m venv .venv
$ .venv/bin/python -m pip install -r src/main/requirements-build.txt
```

On Windows, use `.venv\\Scripts\\python.exe` instead of `.venv/bin/python`.
Set `PROBE_PILOT_PYTHON` if the development app should use a different Python
interpreter.

### Development

```bash
$ npm run dev
```

### Build

Packaging first creates a standalone Python executable for the current operating
system and architecture. PyInstaller does not cross-compile, so Windows, macOS,
and Linux packages must each be built on their respective operating system.

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Python side

The main process spawns Python for two jobs. `src/main/parsing/parse-gbr-files.py`
is the CLI wrapper around the reusable `gerber_parser.py` module and parses the
pads of a Gerber layer. `src/main/hardware_bridge.py` is one long-lived
process that owns the printer and meter connections and serves everything else:
connecting and homing, manual moves with a measurement, test runs, the camera
localisation of the board with the camera-to-printer sync, and the chat agent.
`src/main/README.md` describes the Python modules, the bridge's protocol and the
command-line scripts in `src/scripts`. In development the app runs `.venv`'s
Python (or `PROBE_PILOT_PYTHON`, else `python3`) with `src/main/requirements.txt`
installed; packaged builds ship the PyInstaller executables of
`npm run build:python`. Without a printer connected, test runs use a simulated
head and meter.

The chat agent uses OpenAI's gpt-4o-mini and needs `OPENAI_API_KEY`, in the
environment or in a `.env` file in this directory; uploads of unrecognised files
can be classified with the same key (`src/main/ai/classify-file.ts`). The agent
drives the printer through the bridge and looks at the project through its own
tools, including project-scoped file listing and reading. Text files are returned
verbatim; Gerber files are parsed before the model sees them. The printer has to
be connected from the sidebar before the chat takes a message, and it homes the
printer before the first one. The chat sits to the right of the project's tabs
and can be hidden with the button in the header.

The sidebar's footer connects to the Ultimaker and opens the manual controls:
home, move the probe to a position, take one measurement, retract.

The Live View tab plays the tester's camera, a MediaMTX WebRTC stream on the
Raspberry Pi (default `http://100.127.246.75:8889/pcb/`, changeable in the tab
and remembered locally). "Locate board" takes three frames of the stream and
runs the board localisation on each against the project's drill files (and the
top solder mask when there is one); the pose counts when most frames agree on
it. "Locate from image" does the same with one photo. The camera has to look
straight down at the bed. Put the probe on one of the localised features, enter
or read the printer position and press "Sync camera and printer": the board's
pose is stored with the project and every test run uses it. Runs visit only the
testable pads: top side, at least 0.6 mm across, not under or within 1 mm of a
component of the STEP model (`src/main/testing/testable-pads.ts`).

A project is created from files or a whole export folder (drag it in or use
"Choose a folder"); reports, images and other non-CAD files are skipped or
listed as not used. Altium's mechanical layers all look like outlines by name,
so the one that spans the copper with the fewest drawing operations is kept as
the board outline (`src/shared/outline-choice.ts`). Two netlist formats are
read: IPC-D-356 places nets on the pads, which the run labels and the chat sees;
Altium's Protel `.net` has no coordinates and only tells the chat agent which
component pins share a net.

Two Claude Code skills in `.claude/skills` cover the Arduino firmware in
`src/main/firmware`: `arduino-firmware` for writing it and `arduino-flash` for
compiling and uploading it. Firmware is only ever compiled for and executed on
the Arduino.
