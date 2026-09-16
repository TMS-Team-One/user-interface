"""
Gerber (.gbr) pad-location parser.

Built on PyGerber (https://pypi.org/project/pygerber/), a maintained Gerber
X3 (superset of X2) parser. It correctly implements the extended-attribute
semantics INFORMATION.md describes:
  - %TF.FileFunction,Copper,...% marks a file as a copper layer -> the only
    layers that contain real, conductive pads.
  - %TA.AperFunction,...% tags an aperture as SMDPad / ComponentPad /
    ConnectorPad / ViaPad / TestPad / FiducialPad, etc. Per the Gerber spec
    this attribute is *sticky*: once set, it applies to every aperture
    defined afterwards until a new %TA.AperFunction% (or %TD%) appears -- not
    just the single next aperture. PyGerber implements that correctly.
  - A pad is a D03 "flash" command; PyGerber resolves each flash's absolute
    position and the aperture (shape + attributes) active at that point.
  - %TO.N,<netname>*% tags a flash with the net it belongs to. Pads on a
    ground net (GND, AGND, DGND, PGND, GROUND, ...) are excluded from the
    output. Files that never set %TO.N% (like PCB1's, which carry no net
    attributes at all) can't be filtered this way -- every pad on them is
    kept, since there's nothing to tell a ground pad apart from any other.

Two ways to use main():
  1. Testing: main(None) -> reads a single *.gbr file (chosen via the
     `test_filename` parameter) from the local files/ directory.
  2. Production: main(gbr_content) -> parses the given string, which is the
     full text content of one .gbr file (one Gerber file describes one PCB
     layer/board being submitted).

find_ground_locations() takes the same two forms of input and returns every
GND-net pad/flash and GND-pour region instead, using the same %TO.N% object
attribute (matching GND, AGND, DGND, PGND, 0V, VSS, GROUND, EARTH, CHASSIS
variants). If the file carries no %TO.N% attributes at all, GND can't be
told apart from any other net by geometry alone; the result's `warning`
field flags this rather than silently returning nothing or guessing.
"""

import os
import re
import sys
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from pygerber.gerberx3.parser2.commands2.flash2 import Flash2
from pygerber.gerberx3.parser2.commands2.region2 import Region2
from pygerber.gerberx3.parser2.parser2 import Parser2
from pygerber.gerberx3.tokenizer.tokenizer import Tokenizer

FILES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "files")

# %TA.AperFunction% values that represent a real, physical pad.
PAD_APERTURE_FUNCTIONS = (
    "SMDPad",
    "ComponentPad",
    "ConnectorPad",
    "ViaPad",
    "TestPad",
    "FiducialPad",
)

# %TO.N% (net name) values that mark an object as connected to ground.
# Matches common ground net naming conventions: GND, AGND, DGND, PGND, GND1,
# GROUND, 0V, VSS, EARTH, CHASSIS(_GND).
GROUND_NET_RE = re.compile(
    r"^(?:[A-Z]{0,3}GND\d*|GROUND\d*|0V\d*|VSS\d*|EARTH\d*|CHASSIS(?:_?GND)?)$",
    re.IGNORECASE,
)


@dataclass
class Pad:
    x: float
    y: float
    unit: str
    source: str
    dcode: Optional[int]
    aperture_shape: Optional[str]
    aperture_params: Optional[str]
    aperture_function: Optional[str]
    net_name: Optional[str]

    def as_tuple(self) -> Tuple[float, float]:
        return (self.x, self.y)


@dataclass
class GroundLocation:
    """One GND-net object found in a Gerber file.

    kind is "pad" for a D03 flash or "region" for a filled G36/G37 polygon
    (e.g. a GND pour). A region has no single physical location, so x/y are
    the centroid of its bounding box -- a representative point, not the
    exact copper outline.
    """

    x: float
    y: float
    unit: str
    source: str
    kind: str
    component_ref: Optional[str]
    pin: Optional[str]
    net_name: str

    def as_tuple(self) -> Tuple[float, float]:
        return (self.x, self.y)


@dataclass
class GroundExtractionResult:
    locations: List[GroundLocation] = field(default_factory=list)
    has_net_attributes: bool = False
    warning: Optional[str] = None


def _find_gbr_file(directory: str, filename: str) -> Tuple[str, str]:
    """Recursively looks under `directory` for a *.gbr file named `filename`
    and returns (path relative to `directory`, file content)."""
    for root, _dirs, filenames in os.walk(directory):
        if filename in filenames:
            path = os.path.join(root, filename)
            rel_path = os.path.relpath(path, directory)
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            return rel_path, content
    raise FileNotFoundError(f"No file named {filename!r} found under {directory!r}")


def _is_pad_function(function: Optional[str]) -> bool:
    if function is None:
        # No %TA.AperFunction% attribute available (plain RS-274X, or an
        # aperture the exporting tool didn't tag) -- a D03 flash on a copper
        # layer is still, by definition, a pad.
        return True
    return any(function.startswith(prefix) for prefix in PAD_APERTURE_FUNCTIONS)


def _is_ground_net(net_name: Optional[str]) -> bool:
    return bool(net_name) and GROUND_NET_RE.match(net_name.strip()) is not None


def _pin_number(raw_p: Optional[str]) -> Optional[str]:
    """Extract the pin number/name from a raw %TO.P,<refdes>,<number>[,<function>]%
    value. The refdes half is already available separately via %TO.C%."""
    if not raw_p:
        return None
    parts = raw_p.split(",")
    return parts[1] if len(parts) > 1 else raw_p


def _dcode_number(identifier: Optional[str]) -> Optional[int]:
    if not identifier:
        return None
    digits = identifier.lstrip("D")
    return int(digits) if digits.isdigit() else None


def _aperture_params(aperture) -> Optional[str]:
    if aperture is None:
        return None
    parts = []
    diameter = getattr(aperture, "diameter", None)
    x_size = getattr(aperture, "x_size", None)
    y_size = getattr(aperture, "y_size", None)
    hole = getattr(aperture, "hole_diameter", None)
    if diameter is not None:
        parts.append(f"diameter={diameter.as_inches():.6f}in")
    if x_size is not None and y_size is not None:
        parts.append(f"{x_size.as_inches():.6f}x{y_size.as_inches():.6f}in")
    if hole is not None:
        parts.append(f"hole={hole.as_inches():.6f}in")
    return ", ".join(parts) if parts else None


def _parse_gerber_source(content: str, source: str) -> List[Pad]:
    ast = Tokenizer().tokenize(content)
    parser = Parser2()
    command_buffer = parser.parse(ast)

    file_function = parser.context.get_file_attribute(".FileFunction")
    is_copper = bool(file_function) and file_function.split(",")[0].strip().lower() == "copper"
    if not is_copper:
        return []

    pads: List[Pad] = []
    for command in command_buffer.commands:
        if not isinstance(command, Flash2):
            continue

        aperture = command.aperture
        function = None
        if aperture is not None and aperture.attributes is not None:
            function = aperture.attributes.mapping.get(".AperFunction")

        if not _is_pad_function(function):
            continue

        net_name = command.attributes.mapping.get(".N") if command.attributes is not None else None
        if _is_ground_net(net_name):
            continue

        pads.append(
            Pad(
                x=float(command.flash_point.x.as_inches()),
                y=float(command.flash_point.y.as_inches()),
                unit="IN",
                source=source,
                dcode=_dcode_number(aperture.identifier if aperture is not None else None),
                aperture_shape=type(aperture).__name__ if aperture is not None else None,
                aperture_params=_aperture_params(aperture),
                aperture_function=function,
                net_name=net_name,
            )
        )
    return pads


def _parse_ground_locations(content: str, source: str) -> GroundExtractionResult:
    """Finds every D03 flash or filled region (G36...G37) tagged with a
    GND-like net via the %TO.N% object attribute.

    PyGerber resolves attribute scoping itself: %TO.N,...% stays active on
    each command's `.attributes`/`.object_attributes` mapping until a new
    %TO.N% or a %TD*% clears it, so no manual state tracking is needed here
    -- unlike a regex-based line-by-line scan, which would have to replicate
    that scoping (and coordinate-format/unit parsing) by hand.
    """
    ast = Tokenizer().tokenize(content)
    parser = Parser2()
    command_buffer = parser.parse(ast)

    result = GroundExtractionResult()

    for command in command_buffer.commands:
        if isinstance(command, Flash2):
            attrs = command.attributes.mapping
            net_name = attrs.get(".N")
            if net_name:
                result.has_net_attributes = True
            if not _is_ground_net(net_name):
                continue
            result.locations.append(
                GroundLocation(
                    x=float(command.flash_point.x.as_inches()),
                    y=float(command.flash_point.y.as_inches()),
                    unit="IN",
                    source=source,
                    kind="pad",
                    component_ref=attrs.get(".C"),
                    pin=_pin_number(attrs.get(".P")),
                    net_name=net_name,
                )
            )

        elif isinstance(command, Region2):
            attrs = command.object_attributes.mapping
            net_name = attrs.get(".N")
            if net_name:
                result.has_net_attributes = True
            if not _is_ground_net(net_name):
                continue
            bbox = command.get_bounding_box()
            center_x = (bbox.min_x + bbox.max_x) / 2
            center_y = (bbox.min_y + bbox.max_y) / 2
            result.locations.append(
                GroundLocation(
                    x=float(center_x.as_inches()),
                    y=float(center_y.as_inches()),
                    unit="IN",
                    source=source,
                    kind="region",
                    component_ref=attrs.get(".C"),
                    pin=_pin_number(attrs.get(".P")),
                    net_name=net_name,
                )
            )

    if not result.has_net_attributes:
        result.warning = (
            f"{source}: no X2/X3 net (%TO.N%) attributes found. GND cannot be "
            "reliably determined from geometry alone in this file -- obtain an "
            "IPC-D-356 netlist, or a schematic/BOM/assembly export, instead."
        )

    return result


def find_ground_locations(
    gbr_content: Optional[str] = None,
    test_filename: str = "example_board_top_copper_x3.gbr",
) -> GroundExtractionResult:
    """
    Extracts every GND-net pad/flash and GND-pour region from a single
    Gerber file.

    - gbr_content is None: reads `test_filename` from the local files/
      directory (recursively) for local testing.
    - gbr_content is a non-empty string: treated as the full text content of
      one .gbr file (production mode).
    """
    if gbr_content:
        source, content = "gerber", gbr_content
    else:
        source, content = _find_gbr_file(FILES_DIR, test_filename)

    return _parse_ground_locations(content, source)


def main(
    gbr_content: Optional[str] = None,
    test_filename: str = "example_board_top_copper_x3.gbr",
) -> List[Pad]:
    """
    Extracts every pad location from a single Gerber file (one .gbr file
    describes one PCB).

    - gbr_content is None: reads `test_filename` from the local files/
      directory (recursively) for local testing.
    - gbr_content is a non-empty string: treated as the full text content of
      one .gbr file (production mode).
    """
    if gbr_content:
        source, content = "gerber", gbr_content
    else:
        source, content = _find_gbr_file(FILES_DIR, test_filename)

    return _parse_gerber_source(content, source)


if __name__ == "__main__":
    # Piped invocation (e.g. spawned from the Electron main process): the full
    # .gbr file content is written to stdin, and the parsed pads are printed
    # to stdout as JSON so the caller can JSON.parse() them.
    if not sys.stdin.isatty():
        import json
        from dataclasses import asdict

        gbr_content = sys.stdin.read()
        pads = main(gbr_content)
        print(json.dumps([asdict(pad) for pad in pads]))
    else:
        # Interactive/local testing: parse the local example file instead.
        for pad in main():
            print(pad)
