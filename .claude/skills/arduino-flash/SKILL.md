---
name: arduino-flash
description: Compile a sketch for the Arduino UNO R4 Minima and upload it with arduino-cli, using ProbePilot's port discovery. Use whenever firmware has to be flashed or compile-checked. Writing firmware is the separate arduino-firmware skill.
---

# Flashing the ProbePilot Arduino

## The one rule

Compile for the board, upload to the board, read its serial output. Nothing the
build produces is ever executed on this computer, and no other command touches
the board than the ones below.

## One-time setup

```bash
brew install arduino-cli
arduino-cli core update-index
arduino-cli core install arduino:renesas_uno
arduino-cli lib install "Adafruit ADS1X15"
```

## Flashing

Stop anything that holds the meter's serial port first (ProbePilot runs, the
serial monitor). Then, from the repository root:

```bash
python3 -m src.scripts.flash_firmware src/main/firmware/ads1115_meter
```

The script compiles with `arduino-cli compile --fqbn arduino:renesas_uno:minima`,
finds the board's port through `src/main/serial_ports.py` (USB 2341:0069) and runs
`arduino-cli upload`. Pass `--port /dev/cu.usbmodemXXXX` when the discovery
reports several boards, and `--fqbn` for another board.

A compile-only check, for example while writing firmware:

```bash
arduino-cli compile --fqbn arduino:renesas_uno:minima src/main/firmware/ads1115_meter
```

## Checking the result

```bash
python3 src/scripts/manual_voltage_test.py
```

prints stabilised voltages when the meter streams correctly. For the raw lines:

```bash
arduino-cli monitor -p /dev/cu.usbmodemXXXX -c baudrate=115200
```

## If it fails

- `No serial port found for voltage_meter`: the board is not connected, or the
  port is held by another program.
- `Multiple serial ports match`: pass `--port`.
- Upload errors on the UNO R4: double-tap the reset button to enter the
  bootloader, then upload again.
