import json
from pathlib import Path

import numpy as np

from src.main.vision.locate_pcb import locate_board, project

FIXTURES = Path(__file__).parent / "fixtures" / "arduino_uno_r4"
OUTLINE = json.loads((FIXTURES / "outline.json").read_text())
# The UNO's mounting holes in board millimetres, for checking a pose.
MOUNTING_HOLES = np.float64([(13.97, 2.54), (15.24, 50.8), (66.04, 7.62), (66.04, 35.56)])


def locate(image: str, outline=OUTLINE) -> dict:
    result, _ = locate_board(FIXTURES / image, FIXTURES, outline=outline)
    return result


def test_printer_camera_frame_passes_on_the_four_holes_and_the_rim() -> None:
    # From the camera above the printer bed: 720p, about 5 px per mm, pads too
    # small to see, so the mounting holes plus the rim must be enough.
    result = locate("printer_camera_top_down.jpg")

    fit = result["fit"]
    assert fit["pass"] is True
    assert fit["inliers"] == 4
    assert fit["outline_support"] >= 0.8
    mounting = [
        f for f in result["features"]
        if f["kind"] == "hole" and any(np.allclose(f["board_xy"], hole, atol=0.01) for hole in MOUNTING_HOLES)
    ]
    assert len(mounting) == 4 and all(f["inlier"] for f in mounting)
    detected = np.float64([f["detected_xyr"][:2] for f in mounting])
    board = np.float64([f["board_xy"] for f in mounting])
    assert np.hypot(*(project(np.float64(result["board_to_image"]), board) - detected).T).max() < 2.0


def test_straight_frame_passes_and_is_precise() -> None:
    fit = locate("camera_straight.jpg")["fit"]

    assert fit["pass"] is True
    assert fit["inliers"] >= 5
    assert fit["rms_mm"] < 0.1


def test_tilted_frame_is_rejected_by_the_rim_check() -> None:
    fit = locate("camera_tilted.jpg")["fit"]

    assert fit["pass"] is False
    assert fit["outline_support"] < 0.55


def test_without_an_outline_a_fifth_feature_decides() -> None:
    fit = locate("printer_camera_top_down.jpg", outline=None)["fit"]

    assert fit["outline_support"] is None
    assert fit["pass"] is (fit["inliers"] > 4)


def test_cad_without_a_mask_gives_holes_only(tmp_path) -> None:
    from src.main.vision import cad_features

    # Six plated-through holes of two sizes and a via, no solder mask exported.
    drill = tmp_path / "holes.txt"
    drill.write_text(
        "M48\nMETRIC\nT1C3.200\nT2C2.400\nT3C0.300\n%\nG90\nG05\n"
        "T1\nX5000Y5000\nX60000Y5000\n"
        "T2\nX5000Y40000\nX60000Y40000\nX30000Y5000\nX30000Y40000\n"
        "T3\nX20000Y20000\nM30\n"
    )
    features, files = cad_features.load(tmp_path)

    # The plated via is too small to see; the plated mounting holes count.
    assert files["mask"] is None
    assert [f["kind"] for f in features] == ["hole"] * 6
    assert sorted(round(f["dia"], 1) for f in features) == [2.4, 2.4, 2.4, 2.4, 3.2, 3.2]
