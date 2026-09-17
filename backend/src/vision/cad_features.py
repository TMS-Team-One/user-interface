#!/usr/bin/env python3
"""Circular features a camera can see on a PCB, read from its manufacturing files.

    python3 cad_features.py CAD_DIR        # list them

hole: non-plated round drill hole (mounting holes), from the Excellon drill file.
pad:  round opening in the top solder mask that is not on a drilled hole (test points,
      fiducials, exposed pour spots), from the top solder-mask Gerber.
Plated holes are left out: they carry pins or are vias under solder mask, so they are not
visible as circles. Coordinates are board millimetres in the CAD origin, Y up.
"""
import glob
import os
import re
import sys

import numpy as np


def _coord(text, unit, zeros, digits):
    if "." in text:
        return float(text) * unit
    sign = -1 if text.startswith("-") else 1
    text = text.lstrip("+-")
    width = digits[0] + digits[1]
    text = text.rjust(width, "0") if zeros == "TZ" else text.ljust(width, "0")
    return sign * int(text) / 10 ** digits[1] * unit


def read_excellon(path):
    """Round holes of an Excellon drill file -> [(x_mm, y_mm, diameter_mm, plated)]."""
    tools, holes = {}, []
    unit, zeros, digits, plated, tool, x, y, body = 25.4, "LZ", None, True, None, 0.0, 0.0, False
    for raw in open(path):
        line = raw.strip()
        if not body:
            if line.startswith(("INCH", "METRIC")):
                unit = 25.4 if line.startswith("INCH") else 1.0
                zeros = "TZ" if "TZ" in line else "LZ"
            m = re.match(r";FILE_FORMAT=(\d):(\d)", line)
            if m:
                digits = (int(m.group(1)), int(m.group(2)))
            if "NON_PLATED" in line or "NonPlated" in line:
                plated = False
            elif "PLATED" in line or "Plated" in line:
                plated = True
            m = re.match(r"T(\d+)[A-Z0-9.]*?C([\d.]+)", line)
            if m:
                tools[int(m.group(1))] = (float(m.group(2)) * unit, plated)
            if line in ("%", "M95"):
                body = True
                digits = digits or ((2, 4) if unit == 25.4 else (3, 3))
            continue
        m = re.fullmatch(r"T(\d+)", line)
        if m:
            tool = tools.get(int(m.group(1)))
            continue
        m = re.fullmatch(r"(?:X(-?[\d.]+))?(?:Y(-?[\d.]+))?", line)
        if m and tool and (m.group(1) or m.group(2)):
            if m.group(1):
                x = _coord(m.group(1), unit, zeros, digits)
            if m.group(2):
                y = _coord(m.group(2), unit, zeros, digits)
            holes.append((x, y, *tool))
    return holes


def _round_region(points):
    """Centre and diameter of a polygon region if it is a circle, else None."""
    if len(points) < 12:
        return None
    p = np.array(points)
    centre = p.mean(axis=0)
    d = np.hypot(*(p - centre).T)
    if d.std() > 0.05 * d.mean():
        return None
    return (float(centre[0]), float(centre[1]), float(2 * d.mean()))


def read_gerber_circles(path):
    """Round flashes and round polygon regions of a Gerber file -> [(x_mm, y_mm, diameter_mm)]."""
    apertures, flashes, regions, scale, unit, cur, x, y, region = {}, [], [], 1e-4, 1.0, None, 0.0, 0.0, None
    for raw in open(path):
        line = raw.strip()
        m = re.match(r"%FSLAX(\d)(\d)", line)
        if m:
            scale = 10 ** -int(m.group(2))
            continue
        if line.startswith("%MOIN"):
            unit = 25.4
            continue
        m = re.match(r"%ADD(\d+)C,([\d.]+)", line)
        if m:
            apertures[int(m.group(1))] = float(m.group(2)) * unit
            continue
        if line == "G36*":
            region = []
            continue
        if line == "G37*":
            circle = _round_region(region)
            if circle:
                regions.append(circle)
            region = None
            continue
        m = re.fullmatch(r"(?:G54)?D(\d+)\*", line)
        if m and int(m.group(1)) >= 10:
            cur = int(m.group(1))
            continue
        m = re.fullmatch(r"(?:G0[123])?(?:X(-?\d+))?(?:Y(-?\d+))?(?:I-?\d+)?(?:J-?\d+)?D0([123])\*", line)
        if not m:
            continue
        if m.group(1):
            x = int(m.group(1)) * scale * unit
        if m.group(2):
            y = int(m.group(2)) * scale * unit
        if region is not None:
            region.append((x, y))
        elif m.group(3) == "3" and cur in apertures:
            flashes.append((x, y, apertures[cur]))
    return flashes + regions  # flashes first: exact coordinates win when an opening is drawn twice


def load(cad_dir):
    """Visible circular features of the board -> (features, files used)."""
    paths = sorted(p for p in glob.glob(os.path.join(cad_dir, "**", "*"), recursive=True) if os.path.isfile(p))
    drills = [p for p in paths if open(p, errors="replace").readline().strip() == "M48"]
    masks = [p for p in paths if re.search(r"\.gts$|f[_.-]?mask", os.path.basename(p), re.I)]
    if not drills or not masks:
        raise FileNotFoundError(f"need an Excellon drill file and a top solder-mask Gerber in {cad_dir}")
    holes = [h for p in drills for h in read_excellon(p)]
    features = [{"kind": "hole", "x": x, "y": y, "dia": d} for x, y, d, plated in holes if not plated]
    for x, y, d in read_gerber_circles(masks[0]):
        on_hole = any(np.hypot(x - hx, y - hy) <= 0.5 for hx, hy, _, _ in holes)
        seen = any(np.hypot(x - f["x"], y - f["y"]) <= 0.25 for f in features)
        if not on_hole and not seen:
            features.append({"kind": "pad", "x": x, "y": y, "dia": d})
    files = {"drill": [os.path.relpath(p, cad_dir) for p in drills], "mask": os.path.relpath(masks[0], cad_dir)}
    return features, files


if __name__ == "__main__":
    features, files = load(sys.argv[1])
    print(files)
    for i, f in enumerate(features):
        print(f"{i:3d} {f['kind']:4s} x={f['x']:8.3f} y={f['y']:8.3f} dia={f['dia']:.2f}")
