"""gsim_model.symbol — GSF primitive builders, transforms, ComponentDefinition.

Transform math is checked against hand-derived coordinates, not just
self-consistency, and cross-primitive consistency (rect vs. an equivalent
polygon) is checked explicitly since rect/polygon resolve rotation through
different code paths (corner-pair vs. arbitrary point list).
"""

from __future__ import annotations

import pytest

from gsim_model.symbol import (
    Circle,
    ComponentDefinition,
    Line,
    Polygon,
    Rect,
    SymbolBuilder,
    Text,
)


def test_rotate_90_matches_hand_derived_coordinates() -> None:
    # rect(0,0,10,4) rotated 90 degrees about its own bbox center (5,2):
    # corners (0,0) and (10,4) each rotate to (7,-3) and (3,7) -> normalized
    # back into an axis-aligned box: x=3,y=-3,w=4,h=10.
    r = Rect(x=0, y=0, w=10, h=4)
    rotated = r.rotate(90, center=(5, 2))
    assert (rotated.x, rotated.y, rotated.w, rotated.h) == (3, -3, 4, 10)


def test_rotate_matches_between_rect_and_equivalent_polygon() -> None:
    center = (5.0, 2.0)
    r = Rect(x=0, y=0, w=10, h=4).rotate(90, center=center)
    poly = Polygon(pts=((0, 0), (10, 0), (10, 4), (0, 4))).rotate(90, center=center)

    rect_corners = {(r.x, r.y), (r.x + r.w, r.y + r.h)}
    poly_corner_bbox = {
        (min(p[0] for p in poly.pts), min(p[1] for p in poly.pts)),
        (max(p[0] for p in poly.pts), max(p[1] for p in poly.pts)),
    }
    assert rect_corners == poly_corner_bbox


def test_translate_then_scale_composes_in_call_order() -> None:
    # .translate(5, 0).scale(2) on a circle at (0,0): translate first ->
    # center (5,0); scale(2) about origin (default center) -> (10, 0).
    c = Circle(cx=0, cy=0, r=3)
    result = c.translate(5, 0).scale(2)
    assert (result.cx, result.cy, result.r) == (10, 0, 6)

    # Reversed order gives a different result, proving order matters.
    reversed_result = c.scale(2).translate(5, 0)
    assert (reversed_result.cx, reversed_result.cy, reversed_result.r) == (5, 0, 6)


def test_mirror_x_flips_polygon_points() -> None:
    poly = Polygon(pts=((0, 0), (10, 0), (0, 10)))
    mirrored = poly.mirror("x", center=(0, 5))
    assert mirrored.pts == ((0, 10), (10, 10), (0, 0))


def test_mirror_y_flips_line_points() -> None:
    line = Line(x1=0, y1=0, x2=10, y2=0)
    mirrored = line.mirror("y", center=(5, 0))
    assert (mirrored.x1, mirrored.x2) == (10, 0)


def test_primitives_are_immutable() -> None:
    r = Rect(x=0, y=0, w=10, h=4)
    r.translate(5, 5)
    assert (r.x, r.y) == (0, 0)


def test_symbol_builder_build_shape() -> None:
    b = SymbolBuilder(bbox=(40, 40))
    b.add(Rect(x=0, y=0, w=40, h=40))
    b.add(Circle(cx=20, cy=20, r=5))
    b.add(Text(x=20, y=20, text="Q"))
    b.port("c", side="top", offset=20, kind="physical-electrical", direction="input")
    b.port("e", side="bottom", offset=20, kind="physical-electrical", direction="output")

    built = b.build()
    assert built["symbol"]["shape"] == "primitives"
    assert len(built["symbol"]["primitives"]) == 3
    assert [p["id"] for p in built["ports"]["inputs"]] == ["c"]
    assert [p["id"] for p in built["ports"]["outputs"]] == ["e"]


def test_component_definition_rejects_missing_paradigm() -> None:
    with pytest.raises(ValueError, match="paradigm"):
        ComponentDefinition(
            name="physical_electrical.test.widget",
            label="Widget",
            version=1,
            category="passive",
            description="d",
            paradigm="",  # type: ignore[arg-type]
            domain="physical-electrical",
            symbol_builder=SymbolBuilder(bbox=(20, 20)),
        )


def test_component_definition_rejects_invalid_paradigm() -> None:
    with pytest.raises(ValueError, match="paradigm"):
        ComponentDefinition(
            name="physical_electrical.test.widget",
            label="Widget",
            version=1,
            category="passive",
            description="d",
            paradigm="not-a-real-paradigm",  # type: ignore[arg-type]
            domain="physical-electrical",
            symbol_builder=SymbolBuilder(bbox=(20, 20)),
        )


def test_component_definition_to_dict_validates_against_schema() -> None:
    import json
    import pathlib

    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource

    b = SymbolBuilder(bbox=(20, 20))
    b.add(Rect(x=0, y=0, w=20, h=20))
    b.port("p", side="left", offset=10, kind="physical-electrical", direction="input")
    b.port("n", side="right", offset=10, kind="physical-electrical", direction="output")

    comp = ComponentDefinition(
        name="physical_electrical.test.widget",
        label="Widget",
        version=1,
        category="passive",
        description="A test widget.",
        paradigm="physical-network",
        domain="physical-electrical",
        symbol_builder=b,
        fidelities=[{"tier": "n_a", "doc": "single tier"}],
        behavior={
            "causality": "acausal",
            "domain": "electrical",
            "state_count": 0,
            "equation_template": "physical_electrical.test.widget",
        },
    )

    schemas_dir = (
        pathlib.Path(__file__).resolve().parents[3] / "packages" / "schemas" / "definitions"
    )
    block_schema = json.loads((schemas_dir / "blocks" / "block-metadata.schema.json").read_text())
    port_kind_schema = json.loads((schemas_dir / "model" / "port-kind.schema.json").read_text())

    registry = Registry().with_resource(
        "https://general-simulator.dev/schemas/model/port-kind.schema.json",
        Resource.from_contents(port_kind_schema),
    )
    validator = Draft202012Validator(block_schema, registry=registry)
    errors = list(validator.iter_errors(comp.to_dict()))
    assert errors == [], [e.message for e in errors]
