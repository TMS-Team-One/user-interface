"""The printable bed sheet: a chessboard with markers the size of the glass plate.

    python3 -m src.scripts.marker_sheet OUTPUT.pdf [--a4]

The A3 sheet covers the whole glass (257 x 229 mm); `--a4` prints the back
180 mm of it on an A4 page. Print at 100 % (the bar at the top must measure
200 mm), cut along the outer line, lay the sheet on the glass with the bar at
the back and tape it down; the fixture goes on top of it. `.png` output is
also possible.
"""
import sys

import cv2
import numpy as np
from PIL import Image

from src.main.vision.bed_sheet import A4_ROWS, SQUARES, render

DPI = 300
PAPER_MM = {"a3": (420, 297), "a4": (297, 210)}  # landscape


def main() -> None:
    args = sys.argv[1:]
    a4 = "--a4" in args
    paths = [a for a in args if not a.startswith("--")]
    if len(paths) != 1:
        sys.exit(__doc__)
    sheet = render(DPI, A4_ROWS if a4 else SQUARES[1])
    paper_w, paper_h = (round(mm * DPI / 25.4) for mm in PAPER_MM["a4" if a4 else "a3"])
    page = np.full((paper_h, paper_w), 255, np.uint8)
    y, x = (paper_h - sheet.shape[0]) // 2, (paper_w - sheet.shape[1]) // 2
    page[y:y + sheet.shape[0], x:x + sheet.shape[1]] = sheet
    if paths[0].lower().endswith(".pdf"):
        Image.fromarray(page).save(paths[0], "PDF", resolution=DPI)
    else:
        cv2.imwrite(paths[0], page)
    print(f"wrote {paths[0]}: {'A4' if a4 else 'A3'} landscape at {DPI} dpi")


if __name__ == "__main__":
    main()
