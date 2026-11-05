"""Layout helpers — port-center geometry and orthogonal wire routing.

``port_center``/``exit_direction`` mirror the frontend's port-hit-test
geometry exactly (apps/frontend/src/canvas/nodes/port-hit-test.ts:
``getPortCenter``/``stubDirection`` — mirror, then rotate, then scale by
``SYMBOL_SCALE``, then translate by the block's position) so that
waypoints computed here land exactly on the rendered port centers, with
no drift between what ``ModelBuilder`` writes and what the canvas draws.

``manhattan_waypoints`` is a small single-bend orthogonal router: enough
to make ``ModelBuilder.connect(..., waypoints=...)`` produce a clean
right-angle wire between two arbitrary ports instead of the diagonal
straight line you get by default, without needing a full schematic
autorouter.
"""

from __future__ import annotations

from dataclasses import dataclass

from gsim_model.types import Mirror, Rotation

Position = tuple[float, float]
BBox = tuple[float, float]
Side = str  # "left" | "right" | "top" | "bottom"

SYMBOL_SCALE = 1.6


@dataclass(frozen=True)
class PortGeometry:
    """A port's authored side/offset within its block's unrotated bbox —
    the same shape the catalog metadata's ``ports.{inputs,outputs}[]``
    entries carry (``side``, ``offset``)."""

    side: Side
    offset: float


def _base_port_center(side: Side, offset: float, bbox: BBox) -> Position:
    w, h = bbox
    if side == "left":
        return (0.0, offset)
    if side == "right":
        return (w, offset)
    if side == "top":
        return (offset, 0.0)
    if side == "bottom":
        return (offset, h)
    raise ValueError(f"unknown port side {side!r}")


def _apply_mirror(point: Position, bbox: BBox, mirror: Mirror) -> Position:
    x, y = point
    w, h = bbox
    if mirror == "x":
        return (x, h - y)
    if mirror == "y":
        return (w - x, y)
    return (x, y)


def _apply_rotation(point: Position, bbox: BBox, rotation: Rotation) -> Position:
    x, y = point
    w, h = bbox
    if rotation == 0:
        return (x, y)
    if rotation == 90:
        return (h - y, x)
    if rotation == 180:
        return (w - x, h - y)
    if rotation == 270:
        return (y, w - x)
    raise ValueError(f"unknown rotation {rotation!r}")


def port_center(
    position: Position,
    rotation: Rotation,
    mirror: Mirror,
    port: PortGeometry,
    bbox: BBox,
) -> Position:
    """The port's absolute position in schema/canvas coordinates — exact
    match to the frontend's ``getPortCenter()``."""
    p = _base_port_center(port.side, port.offset, bbox)
    p = _apply_mirror(p, bbox, mirror)
    p = _apply_rotation(p, bbox, rotation)
    return (position[0] + p[0] * SYMBOL_SCALE, position[1] + p[1] * SYMBOL_SCALE)


_EXIT_DIR: dict[Side, tuple[int, int]] = {
    "left": (-1, 0),
    "right": (1, 0),
    "top": (0, -1),
    "bottom": (0, 1),
}


def exit_direction(rotation: Rotation, mirror: Mirror, side: Side) -> tuple[int, int]:
    """The unit direction a wire leaves *side* in, after mirror+rotation —
    exact match to the frontend's ``stubDirection()``."""
    dx, dy = _EXIT_DIR[side]
    if mirror == "x":
        dy = -dy
    if mirror == "y":
        dx = -dx
    if rotation == 90:
        dx, dy = -dy, dx
    elif rotation == 180:
        dx, dy = -dx, -dy
    elif rotation == 270:
        dx, dy = dy, -dx
    return (dx, dy)


def manhattan_waypoints(
    a: Position, a_dir: tuple[int, int], b: Position
) -> list[tuple[int, int]]:
    """A single-bend orthogonal route from port *a* (leaving along
    *a_dir*) to port *b*. Returns only the intermediate waypoint(s) — the
    wire's own endpoints already supply *a* and *b* — ready to pass as
    ``ModelBuilder.connect(..., waypoints=...)``.

    Empty list means *a* and *b* are already axis-aligned (the frontend
    draws a straight line with no bend needed). Otherwise picks the bend
    point by continuing straight out of *a* along its exit direction
    until it's level with *b*, then turning — the same convention real
    schematic tools use for a two-segment route.
    """
    ax, ay = a
    bx, by = b
    if round(ax) == round(bx) or round(ay) == round(by):
        return []
    bend = (bx, ay) if a_dir[0] != 0 else (ax, by)
    return [(round(bend[0]), round(bend[1]))]
