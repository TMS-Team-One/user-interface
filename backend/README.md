# ProbePilot backend

The Python side of the tester. The printer positions a probe above a PCB while
an Arduino UNO R4 Minima with an ADS1115 measures the voltage between the probe
channels; a camera on the printer locates the board; a LangGraph agent answers
the desktop app's chat with tools that look at the project. This folder came
from the `probe-pilot` repository and keeps its layout. The desktop app in this
repository starts the scripts below as modules from this folder.

> ProbePilot is a hackathon prototype. Always supervise the printer while it is moving.

## Hardware

- Ultimaker 2+ (G-code over serial, safe Z heights enforced by the motion controller)
- Arduino UNO R4 Minima with an ADS1115 analog-to-digital converter
- Raspberry Pi camera, streamed with MediaMTX

## Structure

```
src/
├── agent/                  LangGraph agent and model configuration
├── motion_control/         Ultimaker movement control, plus a simulated head for dry runs
├── voltage_measurement/    Arduino and ADS1115 communication
├── measurement/            The instrument the test runner reads: ADS1115 or simulated
├── vision/                 Camera localisation of the board and the camera-printer sync
├── test_run/               The probing job runner used by the desktop app
├── tools/                  Tools available to the agent, including the project tools of the app's chat
└── serial_ports.py         Automatic hardware port discovery

scripts/
├── run_test.py             Run a probing job read from stdin, events on stdout
├── locate_pcb.py           Locate a board in a camera image
├── sync_pose.py            Board pose from one pad the probe stands on
├── printer_position.py     Current printer position as JSON
├── detect_holes.py         Detect drill holes in a camera image
├── calibrate_bed.py        One-time camera-to-bed calibration
├── chat.py                 One chat turn with the agent about a project
├── flash_firmware.py       Compile and upload the Arduino firmware
└── manual_voltage_test.py  Print the meter's readings

firmware/
└── ads1115_meter/          The Arduino sketch of the voltage meter
```

Run every script as a module from this folder, for example
`python3 -m scripts.run_test --simulate < job.json`.

## Installation

```
pip install -r requirements.txt
```

The chat agent needs an OpenAI key in `backend/.env`:

```
OPENAI_API_KEY=your-api-key
```

OpenAI and gpt-4o-mini are used by default. The model integration is
provider-neutral, so another LangChain provider can be added without changing
the graph.

## Serial-port discovery

The voltage meter and the Ultimaker are found by their USB vendor and product
IDs, so changing port names such as `/dev/cu.usbmodem14101` need no
configuration. `python -m serial.tools.list_ports -v` lists the connected
devices. Discovery raises an error when a device is missing or when several
matching devices are connected. Only tested on macOS.

## Running a probing job

`scripts/run_test.py` reads one JSON job from stdin and streams what happens as
JSON lines on stdout. It uses the Ultimaker and the ADS1115 meter when they
answer and falls back to simulated ones otherwise; `--simulate` never touches
hardware and `--time-scale 0.1` makes the simulated head ten times faster. The
formats are documented at the top of `src/test_run/runner.py`. The desktop
app's Testing tab starts this script.

## Locating the board with the camera

The board can lie anywhere on the bed. `python3 -m scripts.locate_pcb IMAGE
--cad CAD_DIR --bed bed_calibration.json` finds its mounting holes and round
pads in the image, fits them to the drill file and top solder-mask Gerber, and
writes `<image>_located.json` with the board's origin and angle on the bed and
the printer coordinates of every feature. Pass that file as `"located"` in a
probing job and the runner uses the pose. `bed_calibration.json` comes from
`scripts.calibrate_bed` once per camera setup; `scripts.detect_holes` numbers
the holes it needs. The hole detector's radius limits scale with the image width
and its circle-quality threshold is 0.7; both can be overridden on the command
line. The coarse fit tries every three detected circles as mounting holes with an
affine map and predicts the fourth, refines each candidate and keeps the one that
explains the most CAD features. A pose counts as found only with a fifth feature
beyond the four holes and, when `--outline outline.json` gives the board's edge
as `[[x, y], ...]` in mm, when that edge shows a colour change in the image along
at least 55 % of its length. The camera must look straight down at the bed: at a
flat angle the holes turn into ellipses whose centres come out 1 to 2 mm off, and
a 720p frame then fails this check on purpose. Requires `opencv-python-headless`
from `requirements.txt`.

Quicker than the four-point calibration: locate the board, put the probe tip on
one of the localised features, read the printer position, and
`python3 -m scripts.sync_pose` turns that one pad into the board's pose (its
angle comes from the image; see `src/vision/sync.py` for the assumed camera
mounting). The desktop app's Live View tab drives exactly this.

## Chat about a project

`scripts/chat.py` answers one chat turn with the LangGraph agent, given the
conversation and the project's facts (files, pads, last run, pose) as tools the
agent can call. It needs `OPENAI_API_KEY` in `.env`; `--dry-run` answers with a
fixed model to check the wiring. The desktop app's chat panel uses it.

## Arduino firmware

`firmware/ads1115_meter` is the meter's sketch. Two Claude Code skills in the
repository's `.claude/skills` cover the work on it: `arduino-firmware` for
writing it and `arduino-flash` for compiling and uploading with `arduino-cli`.
Firmware is only ever compiled for and executed on the Arduino, never on the
computer.
