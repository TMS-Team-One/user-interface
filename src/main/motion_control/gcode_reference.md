# G-Codes Explanation

| G-Code | Meaning                                             | Example / Note                                   |
| ------ | --------------------------------------------------- | ------------------------------------------------ |
| `G28`  | Home axes, moves head to known reference position   | `G28 X`, `G28 X Y` to home specific axes         |
| `G1`   | Move head to position (X,Y,Z) at speed `F` (mm/min) | `G1 X100 Y50 Z20 F3000`                          |
| `G90`  | Switch to **absolute** positioning                  | `G1 X100` → go to X=100                          |
| `G91`  | Switch to **relative** positioning                  | `G1 X100` → move +100 mm in X                    |
| `M400` | Wait until queued movements are finished            | `move XY → M400 → move Z → M400 → measure`       |
| `M114` | Get current position `(X, Y, Z, E)`                 | `E` = extruder, irrelevant for our project       |
| `G92`  | Set current physical position to (0,0,0)            | `G92 X0 Y0 Z0`; **not persistent after restart** |
