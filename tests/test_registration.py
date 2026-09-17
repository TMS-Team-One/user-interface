import math

import numpy as np
import pytest

import synthetic_camera as truth
from src.main.vision import bed_sheet, camera_model, registration

# The printer's Y runs to the back, the sheet's y to the front: the mapping is mirrored.
# The printout is 0.2 % large, the sheet lies turned by half a degree at (30, 210).
SHEET_TO_PRINTER = np.float64(
    [[1.002 * math.cos(math.radians(0.5)), 1.002 * math.sin(math.radians(0.5)), 30.0],
     [1.002 * math.sin(math.radians(0.5)), -1.002 * math.cos(math.radians(0.5)), 210.0],
     [0, 0, 1]]
)
Z_SHEET = 12.0
MOUNTING_HOLES = [(13.97, 2.54), (66.04, 7.62), (66.04, 35.56), (15.24, 50.8)]
BOARD_HEIGHT = 20.0
# The board (y up in its CAD) lies on the fixture turned 30 degrees, its origin at (90, 60) on the sheet.
BOARD_TO_SHEET = np.float64(
    [[math.cos(math.radians(30)), math.sin(math.radians(30)), 90.0],
     [math.sin(math.radians(30)), -math.cos(math.radians(30)), 60.0],
     [0, 0, 1]]
)


def touch(target: int, error_mm=(0.0, 0.0)) -> dict:
    on_sheet = bed_sheet.grid_xy(*bed_sheet.TARGETS[target])
    x, y = camera_model.project(SHEET_TO_PRINTER, [on_sheet])[0]
    return {"target": target, "printer_xyz": [x + error_mm[0], y + error_mm[1], Z_SHEET]}


def localisation(bed_step_mm: float = 0.0) -> dict:
    on_sheet = camera_model.project(BOARD_TO_SHEET, MOUNTING_HOLES)
    pixels = truth.pixels_of(np.c_[on_sheet, np.full(len(on_sheet), -BOARD_HEIGHT)], bed_step_mm)
    return {"features": [{"id": i, "board_xy": list(hole), "image_xy": pixel.tolist()}
                         for i, (hole, pixel) in enumerate(zip(MOUNTING_HOLES, pixels))]}


def test_three_touches_give_the_mapping_with_its_scale_and_residual() -> None:
    reg = registration.fit_sheet([touch(1), touch(2), touch(3)])

    probe = [[0, 0], [257, 229], [100, 50]]
    assert np.allclose(camera_model.project(reg["sheet_to_printer"], probe),
                       camera_model.project(SHEET_TO_PRINTER, probe), atol=1e-6)
    assert reg["mirrored"] is True and abs(reg["scale"] - 1.002) < 1e-4
    assert reg["residual_mm"] < 1e-6 and reg["z_sheet"] == Z_SHEET and reg["z_spread"] == 0


def test_a_fourth_touch_shows_in_the_residual_and_a_miss_is_refused() -> None:
    reg = registration.fit_sheet([touch(1), touch(2), touch(3), touch(4, (0.1, 0.0))])
    assert 0.02 < reg["residual_mm"] < 0.1

    with pytest.raises(ValueError, match="missed"):
        registration.fit_sheet([touch(1), touch(2), touch(3), touch(4, (1.5, 0.0))])
    with pytest.raises(ValueError, match="at least 3"):
        registration.fit_sheet([touch(1), touch(2)])
    with pytest.raises(ValueError, match="once"):
        registration.fit_sheet([touch(1), touch(1), touch(3)])


def test_a_sheet_not_printed_at_full_size_is_refused() -> None:
    shrunk = [dict(t, printer_xyz=[v * 0.97 if i < 2 else v for i, v in enumerate(t["printer_xyz"])])
              for t in (touch(1), touch(2), touch(3))]
    with pytest.raises(ValueError, match="100 %"):
        registration.fit_sheet(shrunk)


def expected_pose() -> tuple[float, float, float]:
    board_to_printer = SHEET_TO_PRINTER @ BOARD_TO_SHEET
    return (board_to_printer[0, 2], board_to_printer[1, 2],
            math.degrees(math.atan2(board_to_printer[1, 0], board_to_printer[0, 0])))


def test_pose_on_printer_with_the_measured_contact_height() -> None:
    reg = registration.fit_sheet([touch(1), touch(2), touch(3)])

    pose = registration.pose_on_printer(truth.TRUTH, reg, truth.view_at(0.0), localisation(), Z_SHEET + BOARD_HEIGHT)

    x, y, angle = expected_pose()
    assert abs(pose["x"] - x) < 0.02 and abs(pose["y"] - y) < 0.02
    assert abs(pose["rotation_deg"] - angle) < 0.02
    assert pose["z_contact"] == Z_SHEET + BOARD_HEIGHT and pose["board_height_mm"] == BOARD_HEIGHT
    assert pose["height_estimated"] is False and pose["residual_mm"] < 0.01
    assert abs(pose["scale"] - 1.002) < 1e-3 and pose["warnings"] == []


def test_pose_estimates_the_board_height_from_its_size_until_it_is_touched() -> None:
    reg = registration.fit_sheet([touch(1), touch(2), touch(3)])

    pose = registration.pose_on_printer(truth.TRUTH, reg, truth.view_at(10.0), localisation(10.0), None)

    x, y, angle = expected_pose()
    assert abs(pose["board_height_mm"] - BOARD_HEIGHT) < 0.3
    assert abs(pose["x"] - x) < 0.2 and abs(pose["y"] - y) < 0.2 and abs(pose["rotation_deg"] - angle) < 0.05
    assert pose["z_contact"] is None and pose["height_estimated"] is True
    assert any("estimated" in w for w in pose["warnings"])


def test_pose_warns_when_the_contact_height_does_not_match_the_board() -> None:
    reg = registration.fit_sheet([touch(1), touch(2), touch(3)])

    pose = registration.pose_on_printer(truth.TRUTH, reg, truth.view_at(0.0), localisation(), Z_SHEET + 5.0)

    assert any("CAD size" in w for w in pose["warnings"])


def test_bridge_calibrates_registers_and_reports_the_pose(tmp_path) -> None:
    import json
    import pathlib

    import cv2

    from src.main.hardware_bridge import HardwareBridge
    from test_ultimaker import FakeMotion, FakeVoltageMeter

    bridge = HardwareBridge(lambda: FakeMotion(), FakeVoltageMeter)
    pictures = []
    for step in (0.0, 20.0, 40.0):
        path = tmp_path / f"sheet-{step:.0f}.jpg"
        cv2.imwrite(str(path), truth.picture(step))
        pictures.append({"image": str(path), "bed_z": 100.0 + step})
    camera = bridge.calibrate_camera({"pictures": pictures})
    assert abs(camera["focal_px"] - truth.FOCAL_PX) < 0.02 * truth.FOCAL_PX
    sheet = bridge.register_sheet({"touches": [touch(1), touch(2), touch(3)]})
    registered = {"camera": camera, "sheet": sheet}

    view = bridge.detect_sheet({"image": pictures[0]["image"], "registration": registered})
    assert view["corners"] >= 60 and "1" in view["targets"] and view["distance_mm"] is not None

    # The Arduino fixture picture shows no sheet: the localisation passes, the pose is missing with a reason.
    fixtures = pathlib.Path(__file__).parent / "fixtures" / "arduino_uno_r4"
    located = bridge.locate_board({
        "image": str(fixtures / "printer_camera_top_down.jpg"), "cad_dir": str(fixtures),
        "outline": json.loads((fixtures / "outline.json").read_text()),
        "annotated": str(tmp_path / "annotated.jpg"), "registration": registered, "z_contact": None,
    })
    assert located["fit"]["pass"] and "pose_on_printer" not in located and "not seen" in located["sheet_error"]

    # A localisation that saw the sheet gets its pose once the contact height is known.
    seen = {**localisation(), "sheet_view": view, "fit": {"pass": True}}
    pose = bridge.board_pose({"localisation": seen, "registration": registered, "z_contact": Z_SHEET + BOARD_HEIGHT})
    x, y, angle = expected_pose()
    assert abs(pose["x"] - x) < 0.1 and abs(pose["y"] - y) < 0.1 and abs(pose["rotation_deg"] - angle) < 0.1
    with pytest.raises(ValueError, match="did not see the sheet"):
        bridge.board_pose({"localisation": localisation(), "registration": registered, "z_contact": None})
    with pytest.raises(ValueError, match="register the sheet"):
        bridge.board_pose({"localisation": seen, "registration": {"camera": camera, "sheet": None}})
