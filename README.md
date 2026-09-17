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

## Python and probe-pilot

The main process spawns `python3` for two jobs: Gerber pad parsing
(`src/main/parsing/parse-gbr-files.py`, needs `pygerber`, see
`src/main/parsing/requirements.txt`) and test runs, which go through the
`probe-pilot` repository's `scripts/run_test.py`. That checkout is expected next
to this one; set `PROBE_PILOT_DIR` to point elsewhere. Without a printer and
meter connected the runner simulates both.

Uploads of unrecognised files can be classified by OpenAI's gpt-4o-mini
(`src/main/ai/classify-file.ts`), and the chat panel talks to probe-pilot's
LangGraph agent; both need `OPENAI_API_KEY`, in the environment or in
`probe-pilot/.env`. Without it, classification stays deterministic and the chat
reports the missing key.

The Live View tab plays the tester's camera, a MediaMTX WebRTC stream on the
Raspberry Pi (default `http://100.127.246.75:8889/pcb/`, changeable in the tab
and remembered locally). "Locate board" (or "Locate from image" with a photo) runs
probe-pilot's localisation on the project's drill and solder-mask files. Put the
probe on one of the localised features, enter or read the printer position and
press "Sync camera and printer": the board's pose is stored with the project and
every test run uses it. Runs visit only the testable pads: top side, at least
0.8 mm across, not under or within 1 mm of a component of the STEP model
(`src/main/testing/testable-pads.ts`).
