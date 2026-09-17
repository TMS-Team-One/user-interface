"""The camera's lens and its view of the bed sheet, measured from the sheet itself.

Calibration takes pictures of the sheet with the bed at several known heights.
The sheet's apparent size at each height gives the focal length (the printer's
Z steps are the ruler; a fixed camera sees the bed only ever parallel to
itself, so nothing else would), then the corners of all pictures give the lens
distortion. From then on one picture of the sheet tells where the camera is
relative to it, and any pixel maps to the sheet plane or to a plane a known
height above it, which is where a board's top surface lies.

The sheet frame is that of src/main/vision/bed_sheet.py; heights above the
sheet are towards the camera, so a point `h` above it has z = -h there.
"""
import time

import cv2
import numpy as np

from src.main.vision import bed_sheet

MIN_HEIGHTS = 2
MIN_CORNERS_CALIBRATION = 12  # in every picture
MIN_CORNERS_VIEW = 8
# How much a lens is allowed to be off the pinhole model, in pixels, RMS.
MAX_RMS_PX = 1.0
SHEET_CENTRE = (bed_sheet.BED_MM[0] / 2, bed_sheet.BED_MM[1] / 2)


def calibrate(pictures: list[tuple[np.ndarray, float]]) -> dict:
    """The camera model from (image, bed_z) pairs; bed_z grows as the bed moves away."""
    views = []
    for image, bed_z in pictures:
        sheet_xy, image_xy, ids = bed_sheet.detect(image)
        if len(ids) < MIN_CORNERS_CALIBRATION:
            raise ValueError(f"only {len(ids)} sheet corners in the picture at Z {bed_z:.1f}; "
                             "is the sheet in view and the head parked?")
        views.append((sheet_xy, image_xy, float(bed_z)))
    if len({round(v[2], 2) for v in views}) < MIN_HEIGHTS:
        raise ValueError(f"pictures at {MIN_HEIGHTS} or more bed heights are needed")
    size = (int(pictures[0][0].shape[1]), int(pictures[0][0].shape[0]))
    model = _fit(views, size, focal_length_px(views))
    # Once more on undistorted corners: the scales, hence the focal length, come out cleaner.
    undistorted = [(s, undistort_points(model, i), z) for s, i, z in views]
    model = _fit(views, size, focal_length_px(undistorted))
    if model["rms_px"] > MAX_RMS_PX:
        raise ValueError(f"the pictures do not fit one camera (RMS {model['rms_px']:.2f} px); "
                         "did the sheet or the camera move between them?")
    return model


def focal_length_px(views) -> float:
    """From how the sheet shrinks as the bed moves away: 1/scale grows linearly with the
    distance, and the printer's steps give the distance in millimetres."""
    inverse_scales, steps = [], []
    for sheet_xy, image_xy, bed_z in views:
        H, _ = cv2.findHomography(sheet_xy, image_xy, 0)
        centre, along_x, along_y = project(H, [SHEET_CENTRE, (SHEET_CENTRE[0] + 1, SHEET_CENTRE[1]),
                                               (SHEET_CENTRE[0], SHEET_CENTRE[1] + 1)])
        jacobian = np.c_[along_x - centre, along_y - centre]
        inverse_scales.append(1 / np.sqrt(abs(np.linalg.det(jacobian))))
        steps.append(bed_z)
    slope, _ = np.polyfit(steps, inverse_scales, 1)
    if slope <= 0:
        raise ValueError("the sheet does not get smaller as the bed moves away; check the bed heights")
    return float(1 / slope)


def _fit(views, size, focal_px: float) -> dict:
    """Lens distortion and the camera's distance for every picture, the focal length and the
    principal point (image centre) held fixed."""
    K = np.float64([[focal_px, 0, size[0] / 2], [0, focal_px, size[1] / 2], [0, 0, 1]])
    flags = (cv2.CALIB_USE_INTRINSIC_GUESS | cv2.CALIB_FIX_FOCAL_LENGTH | cv2.CALIB_FIX_PRINCIPAL_POINT
             | cv2.CALIB_FIX_ASPECT_RATIO | cv2.CALIB_ZERO_TANGENT_DIST | cv2.CALIB_FIX_K3)
    object_points = [np.c_[s, np.zeros(len(s))].astype(np.float32) for s, _, _ in views]
    image_points = [i.astype(np.float32).reshape(-1, 1, 2) for _, i, _ in views]
    rms, K, dist, rvecs, tvecs = cv2.calibrateCamera(object_points, image_points, size, K, None, flags=flags)
    # The camera's distance to the sheet centre must have changed by the bed's steps.
    distances = [float((cv2.Rodrigues(r)[0] @ [*SHEET_CENTRE, 0] + t.ravel())[2]) for r, t in zip(rvecs, tvecs)]
    steps = [v[2] for v in views]
    step_residual = max(abs((d - distances[0]) - (z - steps[0])) for d, z in zip(distances, steps))
    return {
        "version": 1,
        "calibrated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "image": {"width": size[0], "height": size[1]},
        "camera_matrix": K.tolist(),
        "distortion": dist.ravel().tolist(),
        "focal_px": round(float(focal_px), 2),
        "rms_px": round(float(rms), 3),
        "step_residual_mm": round(float(step_residual), 3),
        "pictures": [{"bed_z": round(z, 3), "corners": len(s), "distance_mm": round(d, 2)}
                     for (s, _, z), d in zip(views, distances)],
    }


def project(H, pts):
    return cv2.perspectiveTransform(np.float64(pts).reshape(-1, 1, 2), np.float64(H)).reshape(-1, 2)


def matrices(camera: dict):
    return np.float64(camera["camera_matrix"]), np.float64(camera["distortion"])


def undistort_points(camera: dict, image_xy) -> np.ndarray:
    """Pixels as the lens would deliver them without distortion."""
    K, dist = matrices(camera)
    pts = np.float64(image_xy).reshape(-1, 1, 2)
    if len(pts) == 0:
        return np.zeros((0, 2))
    return cv2.undistortPoints(pts, K, dist, P=K).reshape(-1, 2)


def sheet_view(camera: dict | None, image) -> dict:
    """What a picture shows of the sheet: the corners and targets seen and, with a camera
    model, where the camera stands relative to the sheet."""
    sheet_xy, image_xy, ids = bed_sheet.detect(image)
    targets = {str(t): image_xy[ids.index(bed_sheet.target_corner_id(t))].round(2).tolist()
               for t in bed_sheet.TARGETS if bed_sheet.target_corner_id(t) in ids}
    view = {"image": {"width": int(image.shape[1]), "height": int(image.shape[0])}, "corners": len(ids),
            "targets": targets, "rvec": None, "tvec": None, "rms_px": None, "distance_mm": None, "outline_px": None}
    if camera is None:
        return view
    if len(ids) < MIN_CORNERS_VIEW:
        raise ValueError(f"the sheet is not seen well enough: {len(ids)} corners")
    K, dist = matrices(camera)
    object_points = np.c_[sheet_xy, np.zeros(len(sheet_xy))]
    ok, rvec, tvec = cv2.solvePnP(object_points, undistort_points(camera, image_xy), K, None,
                                  flags=cv2.SOLVEPNP_IPPE)
    if not ok:
        raise ValueError("the sheet's corners do not fit a plane in front of the camera")
    reprojected = cv2.projectPoints(object_points, rvec, tvec, K, dist)[0].reshape(-1, 2)
    R = cv2.Rodrigues(rvec)[0]
    view.update({
        "rvec": rvec.ravel().tolist(),
        "tvec": tvec.ravel().tolist(),
        "rms_px": round(float(np.sqrt(((reprojected - image_xy) ** 2).sum(axis=1).mean())), 3),
        "distance_mm": round(float((R @ [*SHEET_CENTRE, 0] + tvec.ravel())[2]), 2),
    })
    w, h = bed_sheet.BED_MM
    view["outline_px"] = image_from_sheet(camera, view, [(0, 0), (w, 0), (w, h), (0, h)], 0.0).round(2).tolist()
    return view


def sheet_from_image(camera: dict, view: dict, image_xy, height_mm: float) -> np.ndarray:
    """Where pixels land on the plane `height_mm` above the sheet, in sheet millimetres."""
    K, _ = matrices(camera)
    R, t = cv2.Rodrigues(np.float64(view["rvec"]))[0], np.float64(view["tvec"])
    pts = undistort_points(camera, image_xy)
    rays = (np.linalg.inv(K) @ np.c_[pts, np.ones(len(pts))].T).T
    # R [x, y, -h] + t = depth * ray  ->  [r1 r2 -ray] [x y depth] = h r3 - t
    systems = np.stack([np.c_[R[:, 0], R[:, 1], -ray] for ray in rays])
    right_sides = np.broadcast_to(height_mm * R[:, 2] - t, (len(rays), 3))[:, :, None]
    return np.linalg.solve(systems, right_sides)[:, :2, 0]


def depth_mm(camera: dict, view: dict, sheet_xy, height_mm: float) -> np.ndarray:
    """How far the camera is from points on the plane `height_mm` above the sheet."""
    R, t = cv2.Rodrigues(np.float64(view["rvec"]))[0], np.float64(view["tvec"])
    pts = np.c_[np.float64(sheet_xy).reshape(-1, 2), np.full(len(np.float64(sheet_xy).reshape(-1, 2)), -height_mm)]
    return (pts @ R.T + t)[:, 2]


def image_from_sheet(camera: dict, view: dict, sheet_xy, height_mm: float) -> np.ndarray:
    """The pixels where points on the plane `height_mm` above the sheet appear."""
    K, dist = matrices(camera)
    pts = np.c_[np.float64(sheet_xy).reshape(-1, 2), np.full(len(np.float64(sheet_xy).reshape(-1, 2)), -height_mm)]
    return cv2.projectPoints(pts, np.float64(view["rvec"]), np.float64(view["tvec"]), K, dist)[0].reshape(-1, 2)
