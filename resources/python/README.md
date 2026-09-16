# Packaged Python executables

Run `npm run build:python` before packaging the Electron application. The build
script creates platform- and architecture-specific Gerber parser and hardware
backend executables under a directory such as `darwin-arm64/` or `win32-x64/`.

Generated executables are intentionally not committed to Git.
