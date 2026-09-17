"""A made-up camera over the bed sheet, for the vision tests: known lens, known pose."""
import cv2
import numpy as np

from src.main.vision import bed_sheet

FRAME = (1280, 720)
DPI = 300
FOCAL_PX = 1050.0
DISTORTION = np.float64([-0.08, 0.01, 0.0, 0.0, 0.0])
K = np.float64([[FOCAL_PX, 0, FRAME[0] / 2], [0, FOCAL_PX, FRAME[1] / 2], [0, 0, 1]])
# Three degrees off vertical, turned one degree, the sheet centre 300 mm away on the axis.
ROTATION = cv2.Rodrigues(np.float64([np.radians(3), 0, np.radians(1)]))[0]
SHEET_CENTRE = np.float64([bed_sheet.BED_MM[0] / 2, bed_sheet.BED_MM[1] / 2, 0])
TRANSLATION = np.float64([0, 0, 300.0]) - ROTATION @ SHEET_CENTRE

TRUTH = {"camera_matrix": K.tolist(), "distortion": DISTORTION.tolist()}


def translation_at(bed_step_mm: float) -> np.ndarray:
    """The sheet moved `bed_step_mm` away from the camera along its own normal."""
    return TRANSLATION + bed_step_mm * ROTATION[:, 2]


def view_at(bed_step_mm: float, corners: int = 60) -> dict:
    return {"rvec": cv2.Rodrigues(ROTATION)[0].ravel().tolist(), "tvec": translation_at(bed_step_mm).tolist(),
            "corners": corners}


def pixels_of(sheet_xyz, bed_step_mm: float = 0.0) -> np.ndarray:
    """Where sheet-frame points (z negative above the sheet) appear, lens distortion included."""
    pts = np.float64(sheet_xyz).reshape(-1, 3)
    return cv2.projectPoints(pts, cv2.Rodrigues(ROTATION)[0], translation_at(bed_step_mm), K, DISTORTION)[0].reshape(-1, 2)


_PAGE = None


def picture(bed_step_mm: float, seed: int = 1) -> np.ndarray:
    """A picture of the printed sheet through this camera with the bed moved away by `bed_step_mm`."""
    global _PAGE
    px_per_mm = DPI / 25.4
    if _PAGE is None:
        _PAGE = cv2.GaussianBlur(bed_sheet.render(DPI), (0, 0), 0.55 * px_per_mm / 3.5)
    u, v = np.meshgrid(np.arange(FRAME[0], dtype=np.float64), np.arange(FRAME[1], dtype=np.float64))
    normalised = cv2.undistortPoints(np.c_[u.ravel(), v.ravel()].reshape(-1, 1, 2), K, DISTORTION).reshape(-1, 2)
    sheet_to_normalised = np.c_[ROTATION[:, 0], ROTATION[:, 1], translation_at(bed_step_mm)]
    on_sheet = cv2.perspectiveTransform(normalised.reshape(-1, 1, 2), np.linalg.inv(sheet_to_normalised)).reshape(-1, 2)
    maps = (on_sheet * px_per_mm).astype(np.float32)
    frame = cv2.remap(_PAGE, maps[:, 0].reshape(FRAME[1], FRAME[0]), maps[:, 1].reshape(FRAME[1], FRAME[0]),
                      cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=150)
    rng = np.random.default_rng(seed)
    frame = cv2.GaussianBlur(frame, (0, 0), 0.8)
    return np.clip(frame.astype(np.float64) + rng.normal(0, 4, frame.shape), 0, 255).astype(np.uint8)
