"""GSF (Gsim Symbol Format) — programmatic component/symbol creator.

Builds a schematic symbol out of the same eight primitive kinds the
frontend renderer already understands (``apps/frontend/src/canvas/nodes/
primitive-renderer.ts``'s ``Primitive`` union — line, rect, rectf, circle,
arc, polygon, polyline, text), with translate/rotate/scale/mirror
transforms resolved to absolute block-local integer coordinates at
authoring time. No runtime transform evaluation is needed: a built symbol
is plain already-transformed data, exactly what ``metadataToPrimitives()``
already expects (see ``docs/specs/gsim-symbol-format-spec.md``).

Ports are placed with the existing side/offset convention
(:class:`gsim_model.layout.PortGeometry`) — no new port-positioning scheme.

Every :class:`ComponentDefinition` must declare exactly one ``paradigm``
(:data:`gsim_model.types.Paradigm`); omitting it or passing an unknown value
raises ``ValueError``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from typing import Literal

from gsim_model.layout import BBox, PortGeometry, Side
from gsim_model.types import Paradigm, PortKind

Point = tuple[float, float]
Axis = Literal["x", "y"]

_PARADIGMS: frozenset[str] = frozenset(
    {
        "signal-flow",
        "physical-network",
        "converter",
        "hierarchy",
        "routing",
        "annotation",
        "spice-subckt",
    }
)


def _round_point(p: Point) -> Point:
    return (round(p[0]), round(p[1]))


def _rotate_xy(x: float, y: float, cx: float, cy: float, degrees: float) -> Point:
    theta = math.radians(degrees)
    dx, dy = x - cx, y - cy
    cos_t, sin_t = math.cos(theta), math.sin(theta)
    return (cx + dx * cos_t - dy * sin_t, cy + dx * sin_t + dy * cos_t)


def _scale_xy(x: float, y: float, cx: float, cy: float, sx: float, sy: float) -> Point:
    return (cx + (x - cx) * sx, cy + (y - cy) * sy)


def _mirror_xy(x: float, y: float, cx: float, cy: float, axis: Axis) -> Point:
    # Matches gsim_model.layout._apply_mirror / the block-level Mirror
    # convention: "x" flips vertically (y), "y" flips horizontally (x).
    if axis == "x":
        return (x, 2 * cy - y)
    return (2 * cx - x, y)


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------


class Primitive:
    """Common transform surface. Every subclass returns a NEW, resolved
    primitive from each transform call — primitives are immutable."""

    def _points(self) -> list[Point]:
        raise NotImplementedError

    def _with_points(self, points: list[Point]) -> Primitive:
        raise NotImplementedError

    def translate(self, dx: float, dy: float) -> Primitive:
        return self._with_points([(x + dx, y + dy) for x, y in self._points()])

    def rotate(self, degrees: float, center: Point = (0, 0)) -> Primitive:
        cx, cy = center
        return self._with_points(
            [_round_point(_rotate_xy(x, y, cx, cy, degrees)) for x, y in self._points()]
        )

    def scale(self, sx: float, sy: float | None = None, center: Point = (0, 0)) -> Primitive:
        sy = sx if sy is None else sy
        cx, cy = center
        return self._with_points(
            [_round_point(_scale_xy(x, y, cx, cy, sx, sy)) for x, y in self._points()]
        )

    def mirror(self, axis: Axis, center: Point = (0, 0)) -> Primitive:
        cx, cy = center
        return self._with_points(
            [_round_point(_mirror_xy(x, y, cx, cy, axis)) for x, y in self._points()]
        )

    def to_dict(self) -> dict[str, object]:
        raise NotImplementedError


@dataclass(frozen=True)
class Line(Primitive):
    x1: float
    y1: float
    x2: float
    y2: float
    lw: float | None = None
    color: str | None = None

    def _points(self) -> list[Point]:
        return [(self.x1, self.y1), (self.x2, self.y2)]

    def _with_points(self, points: list[Point]) -> Line:
        (x1, y1), (x2, y2) = points
        return replace(self, x1=x1, y1=y1, x2=x2, y2=y2)

    def to_dict(self) -> dict[str, object]:
        d: dict[str, object] = {"type": "line", "x1": self.x1, "y1": self.y1, "x2": self.x2, "y2": self.y2}
        if self.lw is not None:
            d["lw"] = self.lw
        if self.color is not None:
            d["color"] = self.color
        return d


@dataclass(frozen=True)
class Rect(Primitive):
    x: float
    y: float
    w: float
    h: float
    lw: float | None = None
    filled: bool | None = None
    color: str | None = None

    def _points(self) -> list[Point]:
        return [(self.x, self.y), (self.x + self.w, self.y + self.h)]

    def _with_points(self, points: list[Point]) -> Rect:
        (x1, y1), (x2, y2) = points
        x, y = min(x1, x2), min(y1, y2)
        w, h = abs(x2 - x1), abs(y2 - y1)
        return replace(self, x=x, y=y, w=w, h=h)

    def to_dict(self) -> dict[str, object]:
        d: dict[str, object] = {"type": "rect", "x": self.x, "y": self.y, "w": self.w, "h": self.h}
        if self.lw is not None:
            d["lw"] = self.lw
        if self.filled is not None:
            d["filled"] = self.filled
        if self.color is not None:
            d["color"] = self.color
        return d


@dataclass(frozen=True)
class RectF(Primitive):
    x: float
    y: float
    w: float
    h: float
    color: str | None = None

    def _points(self) -> list[Point]:
        return [(self.x, self.y), (self.x + self.w, self.y + self.h)]

    def _with_points(self, points: list[Point]) -> RectF:
        (x1, y1), (x2, y2) = points
        x, y = min(x1, x2), min(y1, y2)
        w, h = abs(x2 - x1), abs(y2 - y1)
        return replace(self, x=x, y=y, w=w, h=h)

    def to_dict(self) -> dict[str, object]:
        d: dict[str, object] = {"type": "rectf", "x": self.x, "y": self.y, "w": self.w, "h": self.h}
        if self.color is not None:
            d["color"] = self.color
        return d


@dataclass(frozen=True)
class Circle(Primitive):
    cx: float
    cy: float
    r: float
    lw: float | None = None
    filled: bool | None = None
    color: str | None = None

    def _points(self) -> list[Point]:
        return [(self.cx, self.cy)]

    def _with_points(self, points: list[Point]) -> Circle:
        (cx, cy) = points[0]
        return replace(self, cx=cx, cy=cy)

    def scale(self, sx: float, sy: float | None = None, center: Point = (0, 0)) -> Circle:
        base = super().scale(sx, sy, center)
        assert isinstance(base, Circle)
        return replace(base, r=round(self.r * sx))

    def to_dict(self) -> dict[str, object]:
        d: dict[str, object] = {"type": "circle", "cx": self.cx, "cy": self.cy, "r": self.r}
        if self.lw is not None:
            d["lw"] = self.lw
        if self.filled is not None:
            d["filled"] = self.filled
        if self.color is not None:
            d["color"] = self.color
        return d


@dataclass(frozen=True)
class Arc(Primitive):
    cx: float
    cy: float
    r: float
    a0: float
    a1: float
    ccw: bool | None = None
    lw: float | None = None
    color: str | None = None

    def _points(self) -> list[Point]:
        return [(self.cx, self.cy)]

    def _with_points(self, points: list[Point]) -> Arc:
        (cx, cy) = points[0]
        return replace(self, cx=cx, cy=cy)

    def rotate(self, degrees: float, center: Point = (0, 0)) -> Arc:
        base = super().rotate(degrees, center)
        assert isinstance(base, Arc)
        rad = math.radians(degrees)
        return replace(base, a0=self.a0 + rad, a1=self.a1 + rad)

    def scale(self, sx: float, sy: float | None = None, center: Point = (0, 0)) -> Arc:
        base = super().scale(sx, sy, center)
        assert isinstance(base, Arc)
        return replace(base, r=round(self.r * sx))

    def to_dict(self) -> dict[str, object]:
        d: dict[str, object] = {
            "type": "arc",
            "cx": self.cx,
            "cy": self.cy,
            "r": self.r,
            "a0": self.a0,
            "a1": self.a1,
        }
        if self.ccw is not None:
            d["ccw"] = self.ccw
        if self.lw is not None:
            d["lw"] = self.lw
        if self.color is not None:
            d["color"] = self.color
        return d


@dataclass(frozen=True)
class Polygon(Primitive):
    pts: tuple[Point, ...]
    lw: float | None = None
    filled: bool | None = None
    color: str | None = None

    def _points(self) -> list[Point]:
        return list(self.pts)

    def _with_points(self, points: list[Point]) -> Polygon:
        return replace(self, pts=tuple(points))

    def to_dict(self) -> dict[str, object]:
        d: dict[str, object] = {"type": "polygon", "pts": [list(p) for p in self.pts]}
        if self.lw is not None:
            d["lw"] = self.lw
        if self.filled is not None:
            d["filled"] = self.filled
        if self.color is not None:
            d["color"] = self.color
        return d


@dataclass(frozen=True)
class Polyline(Primitive):
    pts: tuple[Point, ...]
    lw: float | None = None
    color: str | None = None

    def _points(self) -> list[Point]:
        return list(self.pts)

    def _with_points(self, points: list[Point]) -> Polyline:
        return replace(self, pts=tuple(points))

    def to_dict(self) -> dict[str, object]:
        d: dict[str, object] = {"type": "polyline", "pts": [list(p) for p in self.pts]}
        if self.lw is not None:
            d["lw"] = self.lw
        if self.color is not None:
            d["color"] = self.color
        return d


@dataclass(frozen=True)
class Text(Primitive):
    x: float
    y: float
    text: str
    size: float | None = None
    align: Literal["start", "center", "end"] | None = None
    baseline: Literal["top", "middle", "bottom"] | None = None
    bold: bool | None = None
    filled: bool | None = None
    color: str | None = None

    def _points(self) -> list[Point]:
        return [(self.x, self.y)]

    def _with_points(self, points: list[Point]) -> Text:
        (x, y) = points[0]
        return replace(self, x=x, y=y)

    def to_dict(self) -> dict[str, object]:
        d: dict[str, object] = {"type": "text", "x": self.x, "y": self.y, "text": self.text}
        if self.size is not None:
            d["size"] = self.size
        if self.align is not None:
            d["align"] = self.align
        if self.baseline is not None:
            d["baseline"] = self.baseline
        if self.bold is not None:
            d["bold"] = self.bold
        if self.filled is not None:
            d["filled"] = self.filled
        if self.color is not None:
            d["color"] = self.color
        return d


# ---------------------------------------------------------------------------
# SymbolBuilder
# ---------------------------------------------------------------------------


@dataclass
class _PortSpec:
    id: str
    side: Side
    offset: float
    kind: PortKind
    direction: Literal["input", "output"]
    label: str | None = None


class SymbolBuilder:
    """Accumulates primitives and ports for one component's symbol."""

    def __init__(self, bbox: BBox) -> None:
        self._bbox = bbox
        self._primitives: list[Primitive] = []
        self._ports: list[_PortSpec] = []

    def add(self, primitive: Primitive) -> SymbolBuilder:
        self._primitives.append(primitive)
        return self

    def port(
        self,
        id: str,
        side: Side,
        offset: float,
        kind: PortKind,
        direction: Literal["input", "output"],
        label: str | None = None,
    ) -> SymbolBuilder:
        self._ports.append(_PortSpec(id=id, side=side, offset=offset, kind=kind, direction=direction, label=label))
        return self

    def port_geometries(self) -> dict[str, PortGeometry]:
        """The BE-71/gsim_model.layout-compatible geometry for every placed
        port — reused by auto-routing tooling exactly like a catalog block's
        metadata.yaml-derived ports."""
        return {p.id: PortGeometry(side=p.side, offset=p.offset) for p in self._ports}

    def build(self, text: str | None = None) -> dict[str, object]:
        symbol: dict[str, object] = {
            "bbox": list(self._bbox),
            "shape": "primitives",
            "primitives": [p.to_dict() for p in self._primitives],
        }
        if text is not None:
            symbol["text"] = text
        ports: dict[str, list[dict[str, object]]] = {"inputs": [], "outputs": []}
        for p in self._ports:
            entry: dict[str, object] = {
                "id": p.id,
                "label": p.label if p.label is not None else p.id,
                "kind": {"domain": p.kind},
                "side": p.side,
                "offset": p.offset,
            }
            group = "inputs" if p.direction == "input" else "outputs"
            ports[group].append(entry)
        return {"symbol": symbol, "ports": ports}


# ---------------------------------------------------------------------------
# ComponentDefinition
# ---------------------------------------------------------------------------


@dataclass
class ComponentDefinition:
    """The full "component creator" output: metadata + the built symbol.
    Exactly one ``paradigm`` classification is required.
    """

    name: str
    label: str
    version: int
    category: str
    description: str
    paradigm: Paradigm
    domain: PortKind
    symbol_builder: SymbolBuilder
    type: str | None = None
    aliases: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    params: list[dict[str, object]] = field(default_factory=list)
    fidelities: list[dict[str, object]] = field(default_factory=list)
    behavior: dict[str, object] | None = None
    symbol_text: str | None = None

    def __post_init__(self) -> None:
        if not self.paradigm or self.paradigm not in _PARADIGMS:
            raise ValueError(
                f"ComponentDefinition {self.name!r}: paradigm must be exactly one of "
                f"{sorted(_PARADIGMS)}, got {self.paradigm!r}"
            )

    def to_dict(self) -> dict[str, object]:
        built = self.symbol_builder.build(text=self.symbol_text)
        out: dict[str, object] = {
            "name": self.name,
            **({"type": self.type} if self.type is not None else {}),
            "label": self.label,
            "version": self.version,
            "category": self.category,
            "description": self.description,
            "paradigm": self.paradigm,
            "domain": self.domain,
            "aliases": self.aliases,
            "tags": self.tags,
            "ports": built["ports"],
            "params": self.params,
            "fidelities": self.fidelities,
            "symbol": built["symbol"],
        }
        if self.behavior is not None:
            out["behavior"] = self.behavior
        return out
