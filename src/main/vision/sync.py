"""One-pad synchronisation of the camera with the printer.

The camera sees where the board lies, the printer knows where its head is; the
two frames meet at one pad: put the probe tip on a localised feature, read the
printer position, and the board's origin on the bed follows. The board's angle
comes from its localisation in the image, assuming the camera looks straight
down with its x axis along the printer's X and its y axis along -Y (the usual
mounting; change CAMERA_AXES if yours differs). The probe's Z at the pad is
the contact height. A four-point bed calibration (src.scripts.calibrate_bed) is
more accurate; this is the quick way to get going.
"""
import math

import numpy as np

# Sign of the printer axis each image axis runs along: image x -> +X, image y -> -Y.
CAMERA_AXES = (1.0, -1.0)


def pose_from_sync(located: dict, pad_board_xy, printer_xyz) -> dict:
    """The runner's pose (origin, contact height, angle) from a src.scripts.locate_pcb result,
    the board coordinates of the pad the probe stands on, and the printer position there."""
    if not located.get("fit", {}).get("pass"):
        raise ValueError("the localisation did not pass; locate the board again first")
    H = np.float64(located["board_to_image"])
    angle_in_image = math.atan2(H[1, 0], H[0, 0])
    # A board turned counter-clockwise on the bed appears turned the other way in an
    # image whose y axis points down.
    angle = angle_in_image * CAMERA_AXES[0] * CAMERA_AXES[1]

    px, py = pad_board_xy
    x, y, z = printer_xyz
    origin_x = x - (px * math.cos(angle) - py * math.sin(angle))
    origin_y = y - (px * math.sin(angle) + py * math.cos(angle))
    return {
        "x": round(origin_x, 3),
        "y": round(origin_y, 3),
        "z_contact": round(z, 3),
        "rotation_deg": round(math.degrees(angle), 3),
        "synced_on": {"board_xy": [px, py], "printer_xyz": [x, y, z]},
    }
