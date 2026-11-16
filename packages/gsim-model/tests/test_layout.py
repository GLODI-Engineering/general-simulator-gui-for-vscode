"""gsim_model.layout / gsim_model.catalog — port-center geometry and
orthogonal wire routing.

port_center/exit_direction are meant to be an exact match to the
frontend's port-hit-test.ts (getPortCenter/stubDirection) so that
waypoints computed in Python land exactly on the canvas-rendered port
centers — the test cases below are hand-derived against that same
algorithm, not just checked for self-consistency.
"""

from __future__ import annotations

import pathlib

import pytest

from gsim_model.catalog import load_symbol_geometry
from gsim_model.layout import (
    SYMBOL_SCALE,
    PortGeometry,
    exit_direction,
    manhattan_waypoints,
    port_center,
)


def _engine_catalogue_available() -> bool:
    """Whether the engine's catalogue can be read at all.

    `load_symbol_geometry` reads it through `gsim_py`, which is a one-time `maturin build`
    per interpreter and is deliberately absent from a plain `uv sync` -- so on a checkout
    without it these two tests raised `CatalogUnavailableError` (and, for the negative case,
    it instead of the `FileNotFoundError` being asserted) rather than skipping. Every other
    test in this workspace that needs the engine skips when it is missing; these now do too.
    """
    try:
        import gsim_py  # noqa: F401
    except ImportError:
        return False
    return True


requires_engine_catalogue = pytest.mark.skipif(
    not _engine_catalogue_available(),
    reason="gsim_py not built for this interpreter, so the engine catalogue cannot be read",
)


def test_port_center_unrotated() -> None:
    bbox = (60.0, 40.0)
    left = PortGeometry(side="left", offset=20.0)
    right = PortGeometry(side="right", offset=20.0)

    # offset * SYMBOL_SCALE, and the right face at width * SYMBOL_SCALE.
    assert port_center((100.0, 100.0), 0, "none", left, bbox) == (100.0, 140.0)
    assert port_center((100.0, 100.0), 0, "none", right, bbox) == (220.0, 140.0)


def test_symbol_scale_matches_the_frontend() -> None:
    """The one number both sides must agree on, read from the source of truth.

    These constants drifted: this module sat at 1.6 long after the canvas moved
    to 2, so every port position computed here was short by that ratio and
    anything laid out from Python produced pins that did not line up. Hard-coding
    the expected value on each side is what let that happen -- the parity test
    below was written against 1.6 and kept passing. So read the real one.
    """
    import re

    here = pathlib.Path(__file__).resolve()
    repo = next(p for p in here.parents if (p / "apps" / "frontend").is_dir())
    src = (repo / "apps/frontend/src/canvas/nodes/port-hit-test.ts").read_text(encoding="utf-8")
    m = re.search(r"export const SYMBOL_SCALE\s*=\s*([0-9.]+)", src)
    assert m, "could not find SYMBOL_SCALE in port-hit-test.ts"
    assert float(m.group(1)) == float(SYMBOL_SCALE), (
        f"frontend SYMBOL_SCALE is {m.group(1)}, gsim_model.layout has {SYMBOL_SCALE}"
    )


def test_port_center_rotated_90_matches_frontend_algorithm() -> None:
    # Hand-derived: rotating a 60x40 2-terminal part 90 degrees makes it
    # vertical, both ports at the same x, separated by width*SYMBOL_SCALE.
    bbox = (60.0, 40.0)
    left = PortGeometry(side="left", offset=20.0)
    right = PortGeometry(side="right", offset=20.0)

    p_left = port_center((100.0, 100.0), 90, "none", left, bbox)
    p_right = port_center((100.0, 100.0), 90, "none", right, bbox)

    assert p_left == (140.0, 100.0)
    assert p_right == (140.0, 220.0)


def test_port_center_mirror_x_flips_vertical_offset() -> None:
    bbox = (60.0, 40.0)
    left = PortGeometry(side="left", offset=10.0)

    normal = port_center((0.0, 0.0), 0, "none", left, bbox)
    mirrored = port_center((0.0, 0.0), 0, "x", left, bbox)

    assert normal == (0.0, 20.0)
    assert mirrored == (0.0, 60.0)  # (h - offset) * SYMBOL_SCALE = (40-10)*2


def test_exit_direction_rotates_with_block() -> None:
    assert exit_direction(0, "none", "right") == (1, 0)
    assert exit_direction(90, "none", "right") == (0, 1)
    assert exit_direction(180, "none", "right") == (-1, 0)
    assert exit_direction(270, "none", "right") == (0, -1)


def test_manhattan_waypoints_axis_aligned_needs_no_bend() -> None:
    assert manhattan_waypoints((0.0, 50.0), (1, 0), (200.0, 50.0)) == []


def test_manhattan_waypoints_bends_toward_target() -> None:
    # Exiting rightward (horizontal) from (0, 0) toward (100, 80): bend at
    # (target_x, source_y).
    assert manhattan_waypoints((0.0, 0.0), (1, 0), (100.0, 80.0)) == [(100, 0)]
    # Exiting downward (vertical): bend at (source_x, target_y).
    assert manhattan_waypoints((0.0, 0.0), (0, 1), (100.0, 80.0)) == [(0, 80)]


@requires_engine_catalogue
def test_load_symbol_geometry_resistor() -> None:
    geom = load_symbol_geometry("physical-electrical.passive.resistor")
    assert geom.bbox == (60, 40)
    assert geom.ports["p"] == PortGeometry(side="left", offset=20)
    assert geom.ports["n"] == PortGeometry(side="right", offset=20)


@requires_engine_catalogue
def test_load_symbol_geometry_unknown_type_raises() -> None:
    with pytest.raises(FileNotFoundError):
        load_symbol_geometry("physical-electrical.does_not_exist")
