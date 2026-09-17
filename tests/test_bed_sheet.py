import math

import cv2
import numpy as np

from src.main.vision import bed_sheet

DPI = 300
FRAME = (1280, 720)
# The fixture on the bed hides this part of the sheet (mm from the back-left corner of the glass).
FIXTURE = [[82, 0], [175, 0], [175, 137], [82, 137]]


def camera_view(px_per_mm: float, fixture: bool, rows: int = bed_sheet.SQUARES[1]):
    """A picture of the printed sheet: turned 1 degree, slightly perspective, blurred, noisy.

    Returns the frame and the sheet-mm-to-frame-px homography it was made with.
    """
    turn = math.radians(1)
    similarity = np.eye(3)
    similarity[:2, :2] = px_per_mm * np.float64([[math.cos(turn), -math.sin(turn)], [math.sin(turn), math.cos(turn)]])
    similarity[:2, 2] = np.float64(FRAME) / 2 - similarity[:2, :2] @ np.float64(bed_sheet.BED_MM) / 2
    centre = np.eye(3)
    centre[:2, 2] = -np.float64(FRAME) / 2
    perspective = np.eye(3)
    perspective[2, :2] = (2e-5, 3e-5)
    homography = np.linalg.inv(centre) @ perspective @ centre @ similarity
    page_px_per_mm = DPI / 25.4
    page = cv2.GaussianBlur(bed_sheet.render(DPI, rows), (0, 0), 0.55 * page_px_per_mm / px_per_mm)
    to_frame = homography @ np.diag([1 / page_px_per_mm, 1 / page_px_per_mm, 1.0])
    frame = cv2.warpPerspective(page, to_frame, FRAME, borderMode=cv2.BORDER_CONSTANT, borderValue=150)
    rng = np.random.default_rng(1)
    if fixture:
        quad = cv2.perspectiveTransform(np.float32([FIXTURE]).reshape(1, -1, 2), homography.astype(np.float32))[0]
        cv2.fillConvexPoly(frame, np.int32(quad), 95)
        for _ in range(40):  # some texture on the fixture
            a, b = quad[rng.integers(0, 4)], quad[rng.integers(0, 4)]
            cv2.line(frame, tuple(np.int32(a)), tuple(np.int32(b)), int(rng.integers(30, 230)), int(rng.integers(1, 4)))
    frame = cv2.GaussianBlur(frame, (0, 0), 0.8)
    frame = np.clip(frame.astype(np.float64) + rng.normal(0, 4, frame.shape), 0, 255).astype(np.uint8)
    return frame, homography


def corner_errors_px(frame, homography):
    sheet_xy, image_xy, ids = bed_sheet.detect(frame)
    truth = cv2.perspectiveTransform(sheet_xy.reshape(-1, 1, 2), homography).reshape(-1, 2)
    return dict(zip(ids, np.linalg.norm(image_xy - truth, axis=1)))


def test_sheet_is_found_around_the_fixture_with_the_targets() -> None:
    errors = corner_errors_px(*camera_view(3.5, fixture=True))

    assert len(errors) >= 45
    assert np.median(list(errors.values())) < 0.3
    for target in bed_sheet.TARGETS:
        assert errors[bed_sheet.target_corner_id(target)] < 0.5


def test_whole_sheet_at_a_lower_bed_and_the_visible_part_at_a_higher_one() -> None:
    low = corner_errors_px(*camera_view(2.8, fixture=False))
    high = corner_errors_px(*camera_view(5.5, fixture=False))

    assert len(low) >= 90 and np.percentile(list(low.values()), 95) < 0.5
    assert len(high) >= 40 and max(high.values()) < 0.5


def test_a4_sheet_has_the_same_corners_as_the_back_of_the_a3_sheet() -> None:
    errors = corner_errors_px(*camera_view(3.5, fixture=True, rows=bed_sheet.A4_ROWS))

    assert len(errors) >= 25
    assert all(bed_sheet.corner_sheet_xy(i)[1] <= bed_sheet.sheet_size_mm(bed_sheet.A4_ROWS)[1] for i in errors)
    assert all(errors[bed_sheet.target_corner_id(t)] < 0.5 for t in bed_sheet.TARGETS)


def test_targets_are_interior_corners_outside_the_fixture() -> None:
    for target, (column_line, row_line) in bed_sheet.TARGETS.items():
        assert 1 <= column_line <= bed_sheet.SQUARES[0] - 1 and 1 <= row_line <= bed_sheet.A4_ROWS - 1
        x, y = bed_sheet.corner_sheet_xy(bed_sheet.target_corner_id(target))
        assert (x, y) == bed_sheet.grid_xy(column_line, row_line)
        assert x < FIXTURE[0][0] or x > FIXTURE[1][0]


def test_sheet_size() -> None:
    assert bed_sheet.sheet_size_mm() == (257.0, 229.0)
    assert bed_sheet.sheet_size_mm(bed_sheet.A4_ROWS) == (257.0, 180.0)
    page = bed_sheet.render(DPI, bed_sheet.A4_ROWS)
    assert page.shape == (round(180 * DPI / 25.4), round(257 * DPI / 25.4))
