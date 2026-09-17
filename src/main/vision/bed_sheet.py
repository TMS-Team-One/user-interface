"""The printed sheet on the glass bed: a chessboard with an ArUco marker in every white square.

The sheet is cut to the glass plate, so its edges are the bed's edges and a
marker row runs along each of them. Every marker identifies its own square, so
whatever part of the sheet a picture shows (the fixture hides the middle) tells
where the sheet lies in that picture. Four chessboard corners are labelled as
targets for the probe tip; touching them ties the sheet to the printer.

Sheet frame: millimetres from the back-left corner of the glass, x to the
right, y towards the front (down in a picture taken with the back at the top).
"""
import math

import cv2
import numpy as np

BED_MM = (257.0, 229.0)  # Ultimaker 2+ glass plate, width x depth
SQUARE_MM = 20.0
MARKER_MM = 15.0
SQUARES = (12, 10)  # columns x rows of the chessboard
GRID_ORIGIN_MM = (8.5, 14.5)  # the chessboard's back-left corner on the glass
DICTIONARY = cv2.aruco.DICT_5X5_100
# Chessboard corners the probe tip is put on: target number -> (column line, row line).
TARGETS = {1: (2, 2), 2: (10, 2), 3: (2, 7), 4: (10, 7)}
A4_ROWS = 8  # an A4 page holds the back 180 mm of the sheet
TARGET_DASH_MM = (3.5, 7.0)  # a white dash on each black diagonal points at the target corner
FRONT_MARGIN_MM = 5.5  # below the last row of a shortened (A4) sheet


def board() -> cv2.aruco.CharucoBoard:
    return cv2.aruco.CharucoBoard(SQUARES, SQUARE_MM, MARKER_MM, cv2.aruco.getPredefinedDictionary(DICTIONARY))


def corner_sheet_xy(corner_id: int) -> tuple[float, float]:
    """Where chessboard corner `corner_id` (OpenCV's numbering) lies on the sheet, in mm."""
    columns = SQUARES[0] - 1
    return grid_xy(corner_id % columns + 1, corner_id // columns + 1)


def grid_xy(column_line: int, row_line: int) -> tuple[float, float]:
    return (GRID_ORIGIN_MM[0] + column_line * SQUARE_MM, GRID_ORIGIN_MM[1] + row_line * SQUARE_MM)


def target_corner_id(target: int) -> int:
    column_line, row_line = TARGETS[target]
    return (row_line - 1) * (SQUARES[0] - 1) + (column_line - 1)


def sheet_size_mm(rows: int = SQUARES[1]) -> tuple[float, float]:
    if rows == SQUARES[1]:
        return BED_MM
    return (BED_MM[0], GRID_ORIGIN_MM[1] + rows * SQUARE_MM + FRONT_MARGIN_MM)


def detect(img) -> tuple[np.ndarray, np.ndarray, list[int]]:
    """The chessboard corners seen in the picture: (n, 2) sheet mm, (n, 2) image px, corner ids."""
    corners, ids, _, _ = cv2.aruco.CharucoDetector(board()).detectBoard(img)
    if ids is None or len(ids) == 0:
        return np.zeros((0, 2)), np.zeros((0, 2)), []
    ids = [int(i) for i in ids.ravel()]
    sheet = np.float64([corner_sheet_xy(i) for i in ids])
    return sheet, np.float64(corners).reshape(-1, 2), ids


def render(dpi: int = 300, rows: int = SQUARES[1]) -> np.ndarray:
    """The sheet as a grey image at `dpi`, the cutting line at its border.

    `rows` < 10 prints only the back rows (the A4 sheet). The squares under the
    plate's clips are left blank.
    """
    px = dpi / 25.4
    width_mm, height_mm = sheet_size_mm(rows)
    page = np.full((round(height_mm * px), round(width_mm * px)), 255, np.uint8)
    clip_squares = {(0, 0), (SQUARES[0] - 1, 0)}
    if rows == SQUARES[1]:
        clip_squares |= {(0, rows - 1), (SQUARES[0] - 1, rows - 1)}

    def at(x_mm: float, y_mm: float) -> tuple[int, int]:
        return round(x_mm * px), round(y_mm * px)

    for j in range(rows):
        for i in range(SQUARES[0]):
            if (i + j) % 2 == 0 and (i, j) not in clip_squares:
                cv2.rectangle(page, at(*grid_xy(i, j)), at(*grid_xy(i + 1, j + 1)), 0, -1)
    the_board = board()
    marker_px = round(MARKER_MM * px)
    for marker_id, corners in zip(the_board.getIds().ravel(), the_board.getObjPoints()):
        x_mm, y_mm = corners.reshape(4, 3)[0][:2]
        square = (int(x_mm // SQUARE_MM), int(y_mm // SQUARE_MM))
        if square[1] >= rows or square in clip_squares:
            continue
        x, y = at(GRID_ORIGIN_MM[0] + x_mm, GRID_ORIGIN_MM[1] + y_mm)
        page[y:y + marker_px, x:x + marker_px] = cv2.aruco.generateImageMarker(
            the_board.getDictionary(), int(marker_id), marker_px)
    for target, (column_line, row_line) in TARGETS.items():
        # The black squares meet at the corner on one diagonal or the other.
        black_diagonal = 1 if (column_line + row_line) % 2 == 0 else -1
        x_mm, y_mm = grid_xy(column_line, row_line)
        for sign in (1, -1):
            near, far = (sign * d / math.sqrt(2) for d in TARGET_DASH_MM)
            cv2.line(page, at(x_mm + near * black_diagonal, y_mm + near), at(x_mm + far * black_diagonal, y_mm + far),
                     255, round(0.6 * px), cv2.LINE_AA)
        below = column_line if black_diagonal == 1 else column_line - 1
        put_text(page, str(target), at(*grid_xy(below + 0.5, row_line + 0.5)), 6, px, 255, centred=True)

    bar = (GRID_ORIGIN_MM[0] + 20, 8.0)
    cv2.rectangle(page, at(*bar), at(bar[0] + 200, bar[1] + 2), 0, -1)
    for tick in range(0, 201, 50):
        cv2.line(page, at(bar[0] + tick, bar[1] - 1), at(bar[0] + tick, bar[1] + 3), 0, round(0.3 * px))
        put_text(page, f"{tick}", at(bar[0] + tick, bar[1] + 5.5), 2.5, px, 0, centred=True)
    put_text(page, "ProbePilot bed sheet - Ultimaker 2+ glass 257 x 229 mm - this edge goes to the BACK "
             "(clips) - print at 100 %, the bar is 200 mm", at(bar[0], 5.0), 3, px, 0)
    put_text(page, "FRONT", at(width_mm / 2, height_mm - 2.8), 3, px, 0, centred=True)
    cv2.rectangle(page, (0, 0), (page.shape[1] - 1, page.shape[0] - 1), 0, round(0.3 * px))
    return page


def put_text(page, text: str, origin: tuple[int, int], height_mm: float, px: float, colour: int,
             centred: bool = False) -> None:
    font, thickness = cv2.FONT_HERSHEY_SIMPLEX, max(1, round(height_mm * px / 12))
    scale = cv2.getFontScaleFromHeight(font, round(height_mm * px), thickness)
    (width, height), _ = cv2.getTextSize(text, font, scale, thickness)
    x, y = origin
    if centred:
        x, y = x - width // 2, y + height // 2
    cv2.putText(page, text, (x, y), font, scale, colour, thickness, cv2.LINE_AA)
