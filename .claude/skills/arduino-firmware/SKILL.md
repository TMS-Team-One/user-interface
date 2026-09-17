---
name: arduino-firmware
description: Write or change the firmware of ProbePilot's Arduino UNO R4 Minima voltage meter (ADS1115 over I2C, readings streamed over serial). Use for any request to write, edit or extend Arduino code in this repository; the firmware lives in src/main/firmware. Flashing is the separate arduino-flash skill.
---

# Writing firmware for the ProbePilot Arduino

## The one rule

Firmware is a closed process: it is written here, compiled for the board and
executed only on the Arduino. Never run, emulate or "try out" sketch code on
this computer, never port sketch logic into a host-side script to test it, and
never execute anything the build produces. The only checks are a compile for the
board (`arduino-cli compile`, see the arduino-flash skill) and, after flashing,
reading the serial output through `python3 src/scripts/manual_voltage_test.py`.

## Hardware

- Board: Arduino UNO R4 Minima (`arduino:renesas_uno:minima`, USB 2341:0069).
- Meter: ADS1115 16-bit ADC on I2C, library "Adafruit ADS1X15".
- The probe signal goes through a 10 kΩ / 5.1 kΩ divider into CH0 and CH1; the
  host scales the readings back (see `src/main/measurement/instrument.py`).

## Serial contract with the host

`src/main/voltage_measurement/ads1115.py` parses the stream. Keep it exactly:

- 115200 baud, one reading per line, channels scanned in order 0, 1, 2, 3:
  `Kanal <channel>: <raw> | <volts> V` (raw is the signed 16-bit ADC value,
  volts with four decimals, for example `Kanal 0: 8123 | 1.5231 V`).
- Error lines the host understands: `ADS1115 not connected`,
  `ADS1115 initialization failed`, `Fehler beim Lesen von Kanal <channel>`.
- No other output on the serial port. Changing the format means changing the
  parser in the same commit.

## Layout and style

- One sketch per folder under `src/main/firmware/`, folder and `.ino` file share
  a name: `src/main/firmware/ads1115_meter/ads1115_meter.ino` is the reference
  implementation.
- Keep `loop()` short and non-blocking apart from the fixed cycle delay; no
  dynamic allocation, no `String` concatenation in the loop.
- Constants at the top, named; comments say why, not what.
- Reconnect the ADC in `loop()` when `begin()` failed, so a loose wire does not
  need a reset.

## Checklist before handing over

1. The sketch compiles for `arduino:renesas_uno:minima` (arduino-flash skill).
2. Every printed line matches the contract above.
3. Nothing from the sketch was executed on the host.
