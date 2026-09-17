#!/usr/bin/env python3
"""One-time calibration of the fixed camera against the printer bed.

    python3 -m src.scripts.calibrate_bed IMAGE INDEX=X,Y INDEX=X,Y INDEX=X,Y INDEX=X,Y ... [detector flags]

Put a board on the bed and take IMAGE. Run src.scripts.detect_holes on it and read the index of each
hole from <stem>_out.jpg. Jog the nozzle over the centre of at least four of those holes,
note the printer position (M114) of each, and pass them as INDEX=X,Y. Writes
bed_calibration.json with the image px -> printer mm homography. With exactly four points
the fit is exact and has no residual to judge it by; more points, spread over the bed, make
it checkable and more accurate. All later images must be taken at the same bed position and
height and with the same camera settings.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np

from src.main.vision.detect_holes import THRESHOLD, default_radii, detect


def main():
    ap = argparse.ArgumentParser(description="Calibrate the camera against the printer bed.")
    ap.add_argument("image")
    ap.add_argument("pairs", nargs="+", metavar="INDEX=X,Y", help="detected hole index and the printer XY (mm) over it")
    ap.add_argument("--min-radius", type=int, help="smallest hole radius in px (default: scaled from the image width)")
    ap.add_argument("--max-radius", type=int, help="largest hole radius in px (default: scaled from the image width)")
    ap.add_argument("--threshold", type=float, default=THRESHOLD,
                    help=f"circle quality 0-1, lower = more sensitive (default {THRESHOLD})")
    args = ap.parse_args()

    img = cv2.imread(args.image)
    if img is None:
        sys.exit(f"error: cannot read image {args.image}")
    min_radius, max_radius = default_radii(img.shape[1])
    args.min_radius = args.min_radius or min_radius
    args.max_radius = args.max_radius or max_radius
    detected, _ = detect(img, args.min_radius, args.max_radius, args.threshold)
    points = []
    for text in args.pairs:
        m = re.fullmatch(r"(\d+)=(-?[\d.]+),(-?[\d.]+)", text)
        if not m:
            sys.exit(f"error: expected INDEX=X,Y, got {text}")
        i = int(m.group(1))
        if i >= len(detected):
            sys.exit(f"error: hole index {i} does not exist, the image has {len(detected)} holes")
        points.append({"index": i, "image_xy": [round(detected[i][0], 2), round(detected[i][1], 2)],
                       "printer_xy": [float(m.group(2)), float(m.group(3))]})
    if len(points) < 4:
        sys.exit("error: need at least four INDEX=X,Y pairs")
    src = np.float64([p["image_xy"] for p in points])
    dst = np.float64([p["printer_xy"] for p in points])
    H, _ = cv2.findHomography(src, dst, 0)
    resid = np.hypot(*(cv2.perspectiveTransform(src.reshape(-1, 1, 2), H).reshape(-1, 2) - dst).T)
    for p, r in zip(points, resid):
        p["residual_mm"] = round(float(r), 3)
    result = {"source": Path(args.image).name, "image": {"width": img.shape[1], "height": img.shape[0]},
              "params": {"min_radius": args.min_radius, "max_radius": args.max_radius, "threshold": args.threshold},
              "points": points, "rms_mm": round(float(np.sqrt((resid ** 2).mean())), 3),
              "H_image_to_printer": H.tolist()}
    with open("bed_calibration.json", "w") as f:
        json.dump(result, f, indent=2)
    print(f"{len(points)} points, residual RMS {result['rms_mm']:.3f} mm -> bed_calibration.json")


if __name__ == "__main__":
    main()
