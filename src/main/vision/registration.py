"""Registration of the printer against the bed sheet, done with the probe tip.

The tip is put on three or four of the sheet's labelled target corners and the
printer position read at each. That gives the similarity from sheet
millimetres to printer millimetres (turn, shift, the printout's scale, mirrored
when the printer's Y runs the other way), a residual that catches a bad touch,
and the bed height at which the tip touches the paper.

With the camera model, a picture of the sheet then puts a localised board on
the printer: its features go from pixels to the sheet plane at the board's
height (from the contact height measured on the board, or estimated from the
board's apparent size), a similarity to the board's own coordinates gives the
board's origin and angle on the sheet, and the touches carry that onto the
printer. That is the pose every test run uses.
"""
import math
import time

import numpy as np

from src.main.vision import bed_sheet, camera_model

MIN_TOUCHES = 3
MAX_RESIDUAL_MM = 0.5  # a touch further off than this was a miss
MAX_SCALE_ERROR = 0.01  # a printout more than 1 % off is not printed at 100 %
MAX_BOARD_SCALE_ERROR = 0.02  # the board's size through the mapping, when its height is known


def similarity(src, dst):
    """The similarity (scale, turn, shift, mirrored if that fits better) taking `src` points
    to `dst`, least squares: 3x3 matrix, scale, RMS residual."""
    src, dst = np.float64(src).reshape(-1, 2), np.float64(dst).reshape(-1, 2)
    mean_src, mean_dst = src.mean(axis=0), dst.mean(axis=0)
    centred_src, centred_dst = src - mean_src, dst - mean_dst
    U, singular, Vt = np.linalg.svd(centred_dst.T @ centred_src)
    rotation = U @ Vt
    scale = float(singular.sum() / (centred_src ** 2).sum())
    M = np.eye(3)
    M[:2, :2] = scale * rotation
    M[:2, 2] = mean_dst - scale * rotation @ mean_src
    residual = float(np.sqrt(((camera_model.project(M, src) - dst) ** 2).sum(axis=1).mean()))
    return M, scale, residual


def fit_sheet(touches: list[dict]) -> dict:
    """The sheet-to-printer mapping from touches [{target, printer_xyz}, ...]."""
    if len(touches) < MIN_TOUCHES:
        raise ValueError(f"at least {MIN_TOUCHES} touches are needed, got {len(touches)}")
    targets = [int(t["target"]) for t in touches]
    if len(set(targets)) != len(targets):
        raise ValueError("each target may be touched once")
    sheet_xy = [bed_sheet.grid_xy(*bed_sheet.TARGETS[t]) for t in targets]
    printer_xy = [t["printer_xyz"][:2] for t in touches]
    M, scale, residual = similarity(sheet_xy, printer_xy)
    if residual > MAX_RESIDUAL_MM:
        raise ValueError(f"the touches do not fit the sheet (residual {residual:.2f} mm); one of them missed its corner")
    if abs(scale - 1) > MAX_SCALE_ERROR:
        raise ValueError(f"the sheet measures {scale * 100:.1f} % of its size; print it at 100 %")
    heights = [float(t["printer_xyz"][2]) for t in touches]
    return {
        "version": 1,
        "registered_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "sheet_to_printer": M.tolist(),
        "z_sheet": round(float(np.mean(heights)), 3),
        "z_spread": round(max(heights) - min(heights), 3),
        "scale": round(scale, 5),
        "mirrored": bool(np.linalg.det(M[:2, :2]) < 0),
        "residual_mm": round(residual, 4),
        "touches": touches,
    }


def pose_on_printer(camera: dict, sheet: dict, view: dict, localisation: dict, z_contact=None) -> dict:
    """The runner's pose for a localisation: the board's origin and angle on the printer.

    `z_contact` is the bed height at which the tip touches the board's top, if measured;
    without it the board's height above the sheet is estimated from its apparent size,
    good to about half a millimetre, which the touch then replaces."""
    board_xy = [f["board_xy"] for f in localisation["features"]]
    image_xy = [f["image_xy"] for f in localisation["features"]]
    warnings = []
    if z_contact is None:
        # Seen at the sheet's height the board looks larger than it is, by the ratio of
        # the distances; that ratio is its height.
        on_sheet = camera_model.sheet_from_image(camera, view, image_xy, 0.0)
        _, apparent, _ = similarity(board_xy, on_sheet)
        distance = float(camera_model.depth_mm(camera, view, on_sheet, 0.0).mean())
        height = distance * (1 - 1 / apparent)
        warnings.append(f"board height estimated from its size ({height:.1f} mm above the sheet); "
                        "touch the board's surface once for the contact height")
    else:
        height = float(z_contact) - float(sheet["z_sheet"])
    on_plane = camera_model.sheet_from_image(camera, view, image_xy, height)
    board_to_sheet, board_scale, residual = similarity(board_xy, on_plane)
    if z_contact is not None and abs(board_scale - 1) > MAX_BOARD_SCALE_ERROR:
        warnings.append(f"the board measures {board_scale * 100:.1f} % of its CAD size at this height; "
                        "check the contact height")
    board_to_printer = np.float64(sheet["sheet_to_printer"]) @ board_to_sheet
    A = board_to_printer[:2, :2]
    if np.linalg.det(A) < 0:
        warnings.append("the board maps mirrored onto the printer; is the sheet the right way round?")
    return {
        "x": round(float(board_to_printer[0, 2]), 3),
        "y": round(float(board_to_printer[1, 2]), 3),
        "z_contact": None if z_contact is None else round(float(z_contact), 3),
        "rotation_deg": round(math.degrees(math.atan2(A[1, 0], A[0, 0])), 3),
        "scale": round(float(np.sqrt(abs(np.linalg.det(A)))), 4),
        "board_height_mm": round(float(height), 2),
        "height_estimated": z_contact is None,
        "residual_mm": round(residual, 4),
        "corners_seen": int(view["corners"]),
        "warnings": warnings,
    }
