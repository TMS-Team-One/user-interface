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
