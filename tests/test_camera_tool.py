import json
from pathlib import Path

import cv2
import pytest
from langchain_core.messages import ToolMessage

from src.main.agent.session import AgentChatSessions
from src.main.tools.camera import create_camera_tools, rtsp_url

FIXTURES = Path(__file__).parent / "fixtures" / "arduino_uno_r4"


def test_rtsp_address_of_the_live_view_stream() -> None:
    assert rtsp_url("http://100.127.246.75:8889/cam/") == "rtsp://100.127.246.75:8554/cam"
    with pytest.raises(ValueError):
        rtsp_url("not a url")


def test_take_picture_saves_the_frame_and_finds_the_board(tmp_path) -> None:
    grabbed: list[str] = []

    def fake_camera(stream_url: str):
        grabbed.append(stream_url)
        return cv2.imread(str(FIXTURES / "printer_camera_top_down.jpg"))

    context = {
        "camera_url": "http://pi:8889/cam/",
        "pictures_dir": str(tmp_path),
        "cad_dir": str(FIXTURES),
        "outline": json.loads((FIXTURES / "outline.json").read_text()),
    }
    (take_picture,) = create_camera_tools(context, grab=fake_camera)

    result = take_picture.invoke({})

    assert grabbed == ["http://pi:8889/cam/"]
    assert Path(result["picture_path"]).is_file()
    assert (result["width"], result["height"]) == (1280, 720)
    assert result["board"]["found"] is True
    assert result["board"]["matched_features"] == 4
    assert Path(result["board"]["annotated_path"]).is_file()


def test_take_picture_without_a_camera_address_or_cad(tmp_path) -> None:
    (no_camera,) = create_camera_tools({"pictures_dir": str(tmp_path)}, grab=lambda _url: None)
    with pytest.raises(RuntimeError, match="No camera address"):
        no_camera.invoke({})

    (blind,) = create_camera_tools(
        {"camera_url": "http://pi:8889/cam/", "pictures_dir": str(tmp_path)},
        grab=lambda _url: cv2.imread(str(FIXTURES / "camera_tilted.jpg")),
    )
    result = blind.invoke({})
    assert "board" not in result and Path(result["picture_path"]).is_file()


def test_session_attaches_the_picture_to_the_timeline_only(tmp_path) -> None:
    picture = tmp_path / "shot.jpg"
    cv2.imwrite(str(picture), cv2.imread(str(FIXTURES / "camera_tilted.jpg")))
    timeline = [{"type": "tool", "id": "call-1", "name": "take_picture", "args": {}, "status": "running"}]
    events: list[dict] = []
    tool_result = {"picture_path": str(picture), "width": 1280, "height": 720}

    AgentChatSessions._handle_tool_message(
        ToolMessage(content=json.dumps({"ok": True, "result": tool_result}), tool_call_id="call-1"),
        timeline,
        events.append,
    )

    assert events[0]["type"] == "tool-completed"
    assert events[0]["item"]["result"]["picture_data_url"].startswith("data:image/jpeg;base64,")
    assert "picture_data_url" not in tool_result
