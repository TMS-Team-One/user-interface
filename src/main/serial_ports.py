"""Discover the serial ports used by Probe Pilot hardware."""

from __future__ import annotations
from enum import Enum
from serial.tools import list_ports


class SerialDevice(str, Enum):
    """Serial devices that Probe Pilot can discover."""

    VOLTAGE_METER = "voltage_meter"
    ULTIMAKER = "ultimaker"


_USB_IDS = {
    SerialDevice.VOLTAGE_METER: (0x2341, 0x0069),
    SerialDevice.ULTIMAKER: (0x2341, 0x0042),
}

_DESCRIPTION_HINTS = {
    SerialDevice.VOLTAGE_METER: ("uno r4 minima",),
    SerialDevice.ULTIMAKER: ("iousbhostdevice", "ultimaker"),
}


def get_port(device: SerialDevice) -> str:
    """Return the unique serial port for ``device``.

    USB vendor/product IDs are preferred because they are more reliable than
    operating-system descriptions. Descriptions are used only when no USB-ID
    match is available.

    Raises:
        TypeError: If ``device`` is not a :class:`SerialDevice`.
        RuntimeError: If no matching port, or more than one, is found.
    """
    if not isinstance(device, SerialDevice):
        raise TypeError("device must be a SerialDevice")

    ports = list(list_ports.comports())
    expected_vid, expected_pid = _USB_IDS[device]

    usb_id_matches = [
        port
        for port in ports
        if port.vid == expected_vid and port.pid == expected_pid
    ]
    if usb_id_matches:
        return _require_unique(device, usb_id_matches)

    hints = _DESCRIPTION_HINTS[device]
    description_matches = [
        port
        for port in ports
        if any(hint in _port_description(port) for hint in hints)
    ]
    return _require_unique(device, description_matches, available_ports=ports)


def _port_description(port: object) -> str:
    """Combine optional port metadata into normalized searchable text."""
    return " ".join(
        str(getattr(port, attribute, "") or "")
        for attribute in ("description", "manufacturer", "product")
    ).lower()


def _require_unique(
    device: SerialDevice,
    matches: list[object],
    *,
    available_ports: list[object] | None = None,
) -> str:
    """Return one match and report useful diagnostics otherwise."""
    if len(matches) == 1:
        return str(getattr(matches[0], "device"))

    if len(matches) > 1:
        candidates = ", ".join(str(getattr(port, "device")) for port in matches)
        raise RuntimeError(
            f"Multiple serial ports match {device.value}: {candidates}"
        )

    available = ", ".join(
        f"{getattr(port, 'device', 'unknown')} "
        f"({getattr(port, 'description', 'n/a') or 'n/a'})"
        for port in available_ports or []
    ) or "none"
    raise RuntimeError(
        f"No serial port found for {device.value}. Available ports: {available}"
    )
