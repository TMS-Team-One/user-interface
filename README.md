# thinkmakestart-ui

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Python backend

`backend/` holds the Python side of the tester: the probing job runner, the
camera localisation of the board and the camera-to-printer sync, the LangGraph
chat agent, the Arduino firmware and the scripts the app starts. It moved here
from the `probe-pilot` repository and keeps that layout; `backend/README.md`
describes it. Install its dependencies once with
`pip install -r backend/requirements.txt`. The Gerber pad parser
(`src/main/parsing/parse-gbr-files.py`) additionally needs `pygerber`, see
`src/main/parsing/requirements.txt`. The main process spawns `python3` for both,
running the backend's scripts as modules inside `backend/`. Without a printer
and meter connected the runner simulates both.

Uploads of unrecognised files can be classified by OpenAI's gpt-4o-mini
(`src/main/ai/classify-file.ts`), and the chat panel talks to the backend's
LangGraph agent; both need `OPENAI_API_KEY`, in the environment or in
`backend/.env`. Without it, classification stays deterministic and the chat
reports the missing key.

The Live View tab plays the tester's camera, a MediaMTX WebRTC stream on the
Raspberry Pi (default `http://100.127.246.75:8889/pcb/`, changeable in the tab
and remembered locally). "Locate board" (or "Locate from image" with a photo) runs
the backend's localisation on the project's drill and solder-mask files; the
camera has to look straight down at the bed. Put the probe on one of the
localised features, enter or read the printer position and press "Sync camera
and printer": the board's pose is stored with the project and every test run
uses it. Runs visit only the testable pads: top side, at least 0.6 mm across,
not under or within 1 mm of a component of the STEP model
(`src/main/testing/testable-pads.ts`).

Two Claude Code skills in `.claude/skills` cover the Arduino firmware:
`arduino-firmware` for writing it and `arduino-flash` for compiling and
uploading it. Firmware is only ever compiled for and executed on the Arduino.
