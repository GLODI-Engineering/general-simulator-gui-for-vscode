"""gsim_model.layout / gsim_model.catalog — port-center geometry and
orthogonal wire routing.

port_center/exit_direction are meant to be an exact match to the
frontend's port-hit-test.ts (getPortCenter/stubDirection) so that
waypoints computed in Python land exactly on the canvas-rendered port
centers — the test cases below are hand-derived against that same
algorithm, not just checked for self-consistency.
"""

from __future__ import annotations

from gsim_model.catalog import load_symbol_geometry
from gsim_model.layout import PortGeometry, exit_direction, manhattan_waypoints, port_center


def test_port_center_unrotated() -> None:
    bbox = (60.0, 40.0)
    left = PortGeometry(side="left", offset=20.0)
    right = PortGeometry(side="right", offset=20.0)

    assert port_center((100.0, 100.0), 0, "none", left, bbox) == (100.0, 132.0)
    assert port_center((100.0, 100.0), 0, "none", right, bbox) == (196.0, 132.0)


def test_port_center_rotated_90_matches_frontend_algorithm() -> None:
    # Hand-derived: rotating a 60x40 2-terminal part 90 degrees makes it
    # vertical, both ports at the same x, separated by width*SYMBOL_SCALE.
    bbox = (60.0, 40.0)
    left = PortGeometry(side="left", offset=20.0)
    right = PortGeometry(side="right", offset=20.0)

    p_left = port_center((100.0, 100.0), 90, "none", left, bbox)
    p_right = port_center((100.0, 100.0), 90, "none", right, bbox)

    assert p_left == (132.0, 100.0)
    assert p_right == (132.0, 196.0)


def test_port_center_mirror_x_flips_vertical_offset() -> None:
    bbox = (60.0, 40.0)
    left = PortGeometry(side="left", offset=10.0)

    normal = port_center((0.0, 0.0), 0, "none", left, bbox)
    mirrored = port_center((0.0, 0.0), 0, "x", left, bbox)

    assert normal == (0.0, 16.0)
    assert mirrored == (0.0, 48.0)  # (h - offset) * SYMBOL_SCALE = (40-10)*1.6


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


def test_load_symbol_geometry_resistor() -> None:
    geom = load_symbol_geometry("physical-electrical.passive.resistor")
    assert geom.bbox == (60, 40)
    assert geom.ports["p"] == PortGeometry(side="left", offset=20)
    assert geom.ports["n"] == PortGeometry(side="right", offset=20)


def test_load_symbol_geometry_unknown_type_raises() -> None:
    import pytest

    with pytest.raises(FileNotFoundError):
        load_symbol_geometry("physical-electrical.does_not_exist")
