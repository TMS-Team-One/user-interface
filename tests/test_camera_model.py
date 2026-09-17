import numpy as np
import pytest

import synthetic_camera as truth
from src.main.vision import camera_model

STEPS = [0.0, 15.0, 30.0, 45.0]


@pytest.fixture(scope="module")
def model() -> dict:
    return camera_model.calibrate([(truth.picture(step), 100.0 + step) for step in STEPS])


def test_calibration_recovers_the_lens_from_the_bed_steps(model) -> None:
    assert abs(model["focal_px"] - truth.FOCAL_PX) < 0.015 * truth.FOCAL_PX
    assert model["rms_px"] < 0.4
    assert model["step_residual_mm"] < 0.3
    assert [p["bed_z"] for p in model["pictures"]] == [100.0 + s for s in STEPS]
    assert all(p["corners"] >= 60 for p in model["pictures"])

    # Undistortion is a property of the lens, whatever focal length the model settled on.
    on_sheet = np.float64([[20, 20], [240, 20], [240, 210], [20, 210], [128.5, 114.5]])
    distorted = truth.pixels_of(np.c_[on_sheet, np.zeros(5)])
    ideal = camera_model.project(truth.K @ np.c_[truth.ROTATION[:, :2], truth.TRANSLATION], on_sheet)
    assert np.abs(camera_model.undistort_points(model, distorted) - ideal).max() < 0.3


def test_a_picture_gives_the_view_and_pixels_map_to_a_plane_above_the_sheet(model) -> None:
    view = camera_model.sheet_view(model, truth.picture(7.0, seed=5))

    assert view["corners"] >= 60 and view["rms_px"] < 0.4
    assert abs(view["distance_mm"] - 307.0) < 1.0
    assert set(view["targets"]) == {"1", "2", "3", "4"}
    assert len(view["outline_px"]) == 4

    height = 20.0
    on_plane = np.float64([[40, 60], [200, 60], [200, 170], [120, 110]])
    pixels = truth.pixels_of(np.c_[on_plane, np.full(4, -height)], bed_step_mm=7.0)
    assert np.abs(camera_model.sheet_from_image(model, view, pixels, height) - on_plane).max() < 0.1
    assert np.abs(camera_model.image_from_sheet(model, view, on_plane, height) - pixels).max() < 0.4
    assert np.allclose(camera_model.depth_mm(model, view, [[128.5, 114.5]], 0.0), 307.0, atol=1.0)


def test_calibration_needs_two_heights_and_a_visible_sheet() -> None:
    with pytest.raises(ValueError, match="2 or more bed heights"):
        camera_model.calibrate([(truth.picture(0.0), 100.0), (truth.picture(0.0, seed=2), 100.0)])
    blank = np.full((720, 1280, 3), 150, np.uint8)
    with pytest.raises(ValueError, match="only 0 sheet corners"):
        camera_model.calibrate([(blank, 100.0), (truth.picture(15.0), 115.0)])


def test_view_without_a_camera_model_lists_corners_and_targets() -> None:
    view = camera_model.sheet_view(None, truth.picture(0.0))

    assert view["corners"] >= 60 and view["rvec"] is None and view["outline_px"] is None
    assert "1" in view["targets"]
