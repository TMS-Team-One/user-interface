"""The agent's eye: one picture from the camera above the printer bed."""

from __future__ import annotations

import base64
import math
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

from langchain_core.tools import BaseTool, tool

# MediaMTX serves the Live View's WebRTC stream over RTSP on this port as well.
RTSP_PORT = 8554
CAPTURE_TIMEOUT_S = 8.0


def rtsp_url(stream_url: str) -> str:
    """The RTSP address of a stream, e.g. http://host:8889/cam/ -> rtsp://host:8554/cam."""
    parts = urlsplit(stream_url)
    if not parts.hostname:
        raise ValueError(f"not a stream address: {stream_url}")
    return f"rtsp://{parts.hostname}:{RTSP_PORT}/{parts.path.strip('/')}"


def grab_frame(stream_url: str):
    """One frame of the stream as an OpenCV image; raises when the camera does not answer in time."""
    import cv2

    result: dict[str, object] = {}

    def read() -> None:
        capture = cv2.VideoCapture(rtsp_url(stream_url), cv2.CAP_FFMPEG)
        try:
            ok, frame = capture.read()
            result["frame"] = frame if ok else None
        finally:
            capture.release()

    # OpenCV blocks for a long time on an unreachable stream; the thread is left behind then.
    worker = threading.Thread(target=read, daemon=True)
    worker.start()
    worker.join(CAPTURE_TIMEOUT_S)
    if worker.is_alive() or result.get("frame") is None:
        raise RuntimeError(f"No picture from the camera at {stream_url}")
    return result["frame"]


def find_board(picture: Path, cad_dir: str, outline: list | None) -> dict:
    """Runs the board localisation on a picture; the annotated picture is saved next to it."""
    import cv2

    from src.main.vision.locate_pcb import locate_board

    located, annotated = locate_board(picture, cad_dir, outline=outline)
    annotated_path = picture.with_name(picture.stem + "_located.jpg")
    cv2.imwrite(str(annotated_path), annotated)
    fit = located["fit"]
    if fit is None:
        return {"found": False, "message": located["error"], "annotated_path": str(annotated_path)}
    H = located["board_to_image"]
    return {
        "found": fit["pass"],
        "message": "board found" if fit["pass"] else "no reliable match for the board",
        "matched_features": fit["inliers"],
        "rim_support": fit["outline_support"],
        "board_origin_px": [round(H[0][2] / H[2][2], 1), round(H[1][2] / H[2][2], 1)],
        "angle_deg": round(math.degrees(math.atan2(H[1][0], H[0][0])), 2),
        "annotated_path": str(annotated_path),
    }


def picture_data_url(result: object) -> str | None:
    """The annotated picture of a take_picture result, else the picture, as a data URL."""
    if not isinstance(result, dict):
        return None
    board = result.get("board")
    path = (board.get("annotated_path") if isinstance(board, dict) else None) or result.get("picture_path")
    if not isinstance(path, str) or not Path(path).is_file():
        return None
    return "data:image/jpeg;base64," + base64.b64encode(Path(path).read_bytes()).decode("ascii")


def create_camera_tools(context: dict, grab=grab_frame) -> list[BaseTool]:
    """Tools around the camera. `context` names the stream (camera_url), where
    pictures go (pictures_dir) and, for finding the board, the CAD files
    (cad_dir) and the board outline (outline)."""

    @tool("take_picture")
    def take_picture() -> dict:
        """Takes a picture with the camera above the printer bed and looks for the board in it. Returns the picture's file and size and, when the board was found, where it lies in the picture and how sure the match is."""
        stream_url = context.get("camera_url")
        if not stream_url:
            raise RuntimeError("No camera address known; open the Live View once")
        import cv2

        frame = grab(stream_url)
        directory = Path(context.get("pictures_dir") or Path.cwd() / "pictures")
        directory.mkdir(parents=True, exist_ok=True)
        picture = directory / time.strftime("%Y%m%d-%H%M%S.jpg")
        cv2.imwrite(str(picture), frame)
        result: dict[str, object] = {
            "picture_path": str(picture),
            "width": int(frame.shape[1]),
            "height": int(frame.shape[0]),
        }
        if context.get("cad_dir"):
            result["board"] = find_board(picture, context["cad_dir"], context.get("outline"))
        return result

    return [take_picture]
