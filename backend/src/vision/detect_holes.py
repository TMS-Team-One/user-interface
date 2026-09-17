#!/usr/bin/env python3
"""Detect drill holes in a still image of a PCB.

    python3 detect_holes.py IMAGE [--min-radius PX] [--max-radius PX] [--threshold Q]

Writes <stem>.json (hole centres and radii in pixels of the image as OpenCV loads
it, i.e. with EXIF orientation applied; image size; parameters used) and
<stem>_out.jpg (the image with every hole circled and numbered by its JSON index).
Exit status 0 on success, 1 if the image cannot be read.

Requires OpenCV >= 4.3 (HOUGH_GRADIENT_ALT) and NumPy.
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

# Fixed detection parameters; recorded in the JSON together with the CLI ones.
THRESHOLD = 0.7        # HoughCircles param2: circle quality 0-1; the matching against the CAD sorts out the extra circles
# The radius limits were tuned on a 3024 px wide photo; they scale with the image width.
REFERENCE_WIDTH = 3024
MIN_RADIUS_AT_REFERENCE = 10
MAX_RADIUS_AT_REFERENCE = 80
CANNY = 200            # HoughCircles param1: upper Canny edge threshold
DP = 1.5               # HoughCircles accumulator resolution (image px per cell)
MAX_INTERIOR_STD = 45  # reject circles with markings inside (logo rings, text, grid)
MIN_CONTRAST = 15      # reject circles whose inside looks like their outside (domes, sockets)


def default_radii(width):
    """Smallest and largest hole radius in px to look for in an image this wide."""
    scale = width / REFERENCE_WIDTH
    return max(4, round(MIN_RADIUS_AT_REFERENCE * scale)), max(20, round(MAX_RADIUS_AT_REFERENCE * scale))


def is_hole(img, gray, x, y, r):
    """A drilled hole has a featureless interior that differs from its surroundings."""
    h, w = gray.shape
    reach = int(1.6 * r) + 1
    x0, y0 = int(round(x)), int(round(y))
    ys = slice(max(0, y0 - reach), min(h, y0 + reach + 1))
    xs = slice(max(0, x0 - reach), min(w, x0 + reach + 1))
    yy, xx = np.mgrid[ys, xs]
    dist = np.hypot(xx - x, yy - y)
    inner = dist <= 0.7 * r
    outer = (dist >= 1.2 * r) & (dist <= 1.6 * r)
    if gray[ys, xs][inner].std() > MAX_INTERIOR_STD:
        return False
    patch = img[ys, xs]
    contrast = np.linalg.norm(patch[inner].mean(axis=0) - patch[outer].mean(axis=0))
    return contrast >= MIN_CONTRAST


def detect(img, min_radius, max_radius, threshold):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Median blur just under the smallest hole: removes silkscreen lines and noise, keeps holes.
    blur = (min_radius - 1) | 1
    circles = cv2.HoughCircles(cv2.medianBlur(gray, blur), cv2.HOUGH_GRADIENT_ALT, dp=DP,
                               minDist=2 * min_radius, param1=CANNY, param2=threshold,
                               minRadius=min_radius, maxRadius=max_radius)
    holes = []
    for x, y, r in ([] if circles is None else circles[0]):
        # A ringed hole is reported twice (hole edge and ring edge); keep the strongest
        # one that passes, so a rejected ring does not hide the hole inside it.
        if any(np.hypot(x - hx, y - hy) < 2 * min_radius for hx, hy, _ in holes):
            continue
        if is_hole(img, gray, x, y, r):
            holes.append((float(x), float(y), float(r)))
    holes.sort(key=lambda hole: (hole[1], hole[0]))
    return holes, blur


def main():
    ap = argparse.ArgumentParser(description="Detect drill holes in a PCB image.")
    ap.add_argument("image", help="input image (JPEG/PNG)")
    ap.add_argument("--min-radius", type=int, help="smallest hole radius in px (default: scaled from the image width)")
    ap.add_argument("--max-radius", type=int, help="largest hole radius in px (default: scaled from the image width)")
    ap.add_argument("--threshold", type=float, default=THRESHOLD,
                    help=f"circle quality threshold 0-1, lower = more sensitive (default {THRESHOLD})")
    args = ap.parse_args()

    img = cv2.imread(args.image)
    if img is None:
        sys.exit(f"error: cannot read image {args.image}")
    min_radius, max_radius = default_radii(img.shape[1])
    args.min_radius = args.min_radius or min_radius
    args.max_radius = args.max_radius or max_radius

    holes, blur = detect(img, args.min_radius, args.max_radius, args.threshold)

    stem = Path(args.image).with_suffix("")
    result = {
        "source": Path(args.image).name,
        "image": {"width": img.shape[1], "height": img.shape[0]},
        "params": {"min_radius": args.min_radius, "max_radius": args.max_radius,
                   "threshold": args.threshold, "blur": blur, "canny": CANNY, "dp": DP,
                   "max_interior_std": MAX_INTERIOR_STD, "min_contrast": MIN_CONTRAST},
        "holes": [{"x": round(x, 1), "y": round(y, 1), "r": round(r, 1)} for x, y, r in holes],
    }
    with open(f"{stem}.json", "w") as f:
        json.dump(result, f, indent=2)

    thickness = max(1, round(img.shape[1] / 1000))
    for i, (x, y, r) in enumerate(holes):
        center = (int(round(x)), int(round(y)))
        cv2.circle(img, center, int(round(r)), (0, 255, 0), thickness)
        cv2.circle(img, center, thickness, (0, 0, 255), -1)
        cv2.putText(img, str(i), (center[0] + int(r), center[1] - int(r)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7 * thickness, (0, 255, 0), thickness)
    cv2.imwrite(f"{stem}_out.jpg", img)
    print(f"{len(holes)} holes -> {stem}.json, {stem}_out.jpg")


if __name__ == "__main__":
    main()
