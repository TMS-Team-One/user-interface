# ProbePilot

ProbePilot turns an Ultimaker 2+ into an automated PCB probing system.

The printer positions a probe above a PCB, while an Arduino and ADS1115 measure the voltage between two probe channels.
A LangGraph agent connects both parts and translates natural-language instructions into safe movement and measurement operations.

> ProbePilot is currently a hackathon prototype. Always supervise the printer while it is moving.

## How it works

```text
User instruction
      ↓
LangGraph agent
      ↓
Motion and voltage tools
      ↓
Ultimaker 2+ + Arduino/ADS1115
```

For example, the agent can process an instruction such as:
`Move to X=50, Y=50, Z=30 and measure the voltage.`

The language model cannot send arbitrary G-code or access the serial connections directly.
It can only use the registered tools, while the motion controller remains responsible for movement limits and
safe Z heights.

## Hardware

The current prototype uses:

- Ultimaker 2+
- Arduino UNO R4 Minima
- ADS1115 analog-to-digital converter

## Project structure

```
src/main/
├── hardware_bridge.py      Long-lived process the desktop app talks to (see below)
├── agent/                  LangGraph agent, model configuration and chat sessions
├── motion_control/         Ultimaker movement control, plus a simulated head for dry runs
├── voltage_measurement/    Arduino and ADS1115 communication
├── measurement/            The instrument a test run reads: ADS1115 or simulated
├── vision/                 Camera localisation of the board and the camera-printer sync
├── test_run/               The probing job runner
├── tools/                  Tools available to the agent: printer, meter and project
├── firmware/ads1115_meter  The Arduino sketch of the voltage meter
└── serial_ports.py         Automatic hardware port discovery

src/scripts/
├── manual_agent_test.py    Interactive agent prompt with the real hardware
├── manual_robot_control.py
├── manual_voltage_test.py  Print the meter's readings
├── run_test.py             Run a probing job read from stdin, events on stdout
├── locate_pcb.py           Locate a board in a camera image
├── sync_pose.py            Board pose from one pad the probe stands on
├── detect_holes.py         Detect drill holes in a camera image
├── calibrate_bed.py        One-time camera-to-bed calibration
└── flash_firmware.py       Compile and upload the Arduino firmware

tests/                      pytest suite for the bridge, agent session, printer and meter
```

Run the scripts as modules from the repository root, for example
`python3 -m src.scripts.run_test --simulate < job.json`, and the tests with
`python3 -m pytest tests`.

## Installation

The repository's `.venv` (see the main README) with `requirements.txt` installed;
`requirements-build.txt` adds PyInstaller for packaging. The chat agent needs an
OpenAI key in a `.env` file in the repository root:

```
OPENAI_API_KEY=your-api-key
```

OpenAI and gpt-4o-mini are used by default. The model integration is
provider-neutral, so another supported LangChain provider can be added later
without changing the graph.

## Serial-port discovery

ProbePilot automatically finds the connected voltage meter and Ultimaker using their USB vendor and product IDs.
This means changing port names such as: `/dev/cu.usbmodem14101`

do not normally require configuration.
To inspect the connected serial devices manually, run:

```
python -m serial.tools.list_ports -v
```

Port discovery raises an error when a device is missing or when multiple matching devices are connected.

**Note**: only tested on MacOS, not on Windows/Linux.

## Running the agent

Make sure both devices are connected and the probing area is clear. Then run:

```
python src/scripts/manual_agent_test.py
```

The script:

1. Loads the OpenAI API key from .env.
2. Asks for confirmation before connecting.
3. Homes the Ultimaker once.
4. Connects the motion and voltage tools to the agent.
5. Starts an interactive prompt.

Example instruction:

```
There are multiple components on my PCB board: A=(50, 50, 30), B=(100, 50, 40), C=(200, 200, 30).
Please go to component A first, then B, then C and measure the voltage at each component.
```

Enter exit or quit to stop.

## The hardware bridge

`python -m src.main.hardware_bridge` reads JSON requests from stdin, one per
line, `{"id": 1, "method": "connect", "params": {...}}`, and answers each with
`{"id": 1, "ok": true, "result": ...}` or `{"id": 1, "ok": false, "error": "...",
"message": "..."}`. Long requests stream progress first, as
`{"event": "progress", "requestId": 1, "data": {...}}` lines. The desktop app
starts one bridge and keeps it running; it owns the printer and meter
connections, so nothing else opens their ports meanwhile.

Methods: `connect`, `status`, `disconnect`, `home`, `position`,
`run_manual_test` (x, y, z: move, measure, retract), `run_test` (a probing job,
events as in `src/main/test_run/runner.py`; on a simulated head when no printer
is connected), `stop_run`, `locate_board` (image, cad_dir, outline, annotated),
`sync_pose` (located, pad_board_xy, printer_xyz), `chat` (project_id, message,
context) and `chat_history` (project_id). A test run holds the hardware; other
hardware requests are refused until it has finished or was stopped.

## Running a probing job

A job lists the target pads in board millimetres, the board's pose on the bed and
the safe height for moves between pads; the formats are documented at the top of
`src/main/test_run/runner.py`. The desktop app sends it to the bridge as
`run_test`. From the command line, `python3 -m src.scripts.run_test` runs one
read from stdin with the printer and meter it finds, falling back to simulated
ones; `--simulate` never touches hardware and `--time-scale 0.1` makes the
simulated head ten times faster.

## Locating the board with the camera

The board can lie anywhere on the bed. `python3 -m src.scripts.locate_pcb IMAGE
--cad CAD_DIR --bed bed_calibration.json` finds its mounting holes and round
pads in the image, fits them to the drill file and top solder-mask Gerber, and
writes `<image>_located.json` with the board's origin and angle on the bed and
the printer coordinates of every feature. Pass that file as `"located"` in a
probing job and the runner uses the pose. `bed_calibration.json` comes from
`src.scripts.calibrate_bed` once per camera setup; `src.scripts.detect_holes`
numbers the holes it needs. The hole detector's radius limits scale with the
image width and its circle-quality threshold is 0.7; both can be overridden on
the command line. The coarse fit tries every three detected circles as mounting
holes with an affine map and predicts the fourth, refines each candidate and
keeps the one that explains the most CAD features. A pose counts as found only
with a fifth feature beyond the four holes and, when `--outline outline.json`
gives the board's edge as `[[x, y], ...]` in mm, when that edge shows a colour
change in the image along at least 55 % of its length. The camera must look
straight down at the bed: at a flat angle the holes turn into ellipses whose
centres come out 1 to 2 mm off, and a 720p frame then fails this check on
purpose. Requires `opencv-python-headless` from `requirements.txt`.

Quicker than the four-point calibration: locate the board, put the probe tip on
one of the localised features, read the printer position, and
`python3 -m src.scripts.sync_pose` turns that one pad into the board's pose (its
angle comes from the image; see `src/main/vision/sync.py` for the assumed
camera mounting). The desktop app's Live View tab drives exactly this through the
bridge.

## Chat about a project

The bridge's `chat` method answers one turn with the LangGraph agent. The agent
gets the printer and meter tools and, from the context the app sends with every
message (name, files, pads with testability, last run, pose), the project tools
in `src/main/tools/project.py`. The history is kept per project for as long as
the bridge runs, and the printer is homed before the first message of a project.

## Arduino firmware

`src/main/firmware/ads1115_meter` is the meter's sketch. Two Claude Code skills in
the repository's `.claude/skills` cover the work on it: `arduino-firmware` for
writing it and `arduino-flash` for compiling and uploading with `arduino-cli`.
Firmware is only ever compiled for and executed on the Arduino, never on the
computer.
