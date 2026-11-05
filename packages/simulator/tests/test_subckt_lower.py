"""BE-59 — SubcktDef/SubcktInstance validation at IR1-build time.

Covers:
- subckt_lower.check_no_cyclic_defs: direct self-reference and mutual cycles.
- subckt_lower.check_def_refs_resolve: dangling def_ref from a nested
  SubcktInstance or a top-level spice-subckt.instance Block.
- ir1_builder.build() wires both checks in before any netlist is written.
"""

from __future__ import annotations

import pytest

from simulator.compiler.ir1_builder import build
from simulator.compiler.subckt_lower import (
    CyclicSubcktDefError,
    UnknownSubcktDefRefError,
    check_def_refs_resolve,
    check_no_cyclic_defs,
)
from simulator.ir.ir1 import IR1SubcktDef, IR1SubcktInstance, IR1SubcktPort


def _leaf_def(def_id: str, name: str) -> IR1SubcktDef:
    return IR1SubcktDef(
        id=def_id,
        name=name,
        ports=[IR1SubcktPort(id="a", kind="physical-electrical"), IR1SubcktPort(id="b", kind="physical-electrical")],
        body="R1 a b 1k",
    )


def test_no_cycle_passes_silently() -> None:
    leaf = _leaf_def("leaf", "LEAF")
    composite = IR1SubcktDef(
        id="composite",
        name="COMPOSITE",
        ports=[IR1SubcktPort(id="p", kind="physical-electrical"), IR1SubcktPort(id="n", kind="physical-electrical")],
        instances=[IR1SubcktInstance(id="X1", def_ref="leaf", connections=["p", "n"])],
    )
    check_no_cyclic_defs([leaf, composite])  # must not raise


def test_self_reference_raises() -> None:
    loopy = IR1SubcktDef(
        id="loopy",
        name="LOOPY",
        instances=[IR1SubcktInstance(id="X1", def_ref="loopy", connections=[])],
    )
    with pytest.raises(CyclicSubcktDefError):
        check_no_cyclic_defs([loopy])


def test_mutual_cycle_raises() -> None:
    a_def = IR1SubcktDef(
        id="a_def", name="A", instances=[IR1SubcktInstance(id="X1", def_ref="b_def", connections=[])]
    )
    b_def = IR1SubcktDef(
        id="b_def", name="B", instances=[IR1SubcktInstance(id="X1", def_ref="a_def", connections=[])]
    )
    with pytest.raises(CyclicSubcktDefError):
        check_no_cyclic_defs([a_def, b_def])


def test_dangling_nested_def_ref_raises() -> None:
    orphan = IR1SubcktDef(
        id="orphan",
        name="ORPHAN",
        instances=[IR1SubcktInstance(id="X1", def_ref="ghost", connections=[])],
    )
    with pytest.raises(UnknownSubcktDefRefError):
        check_def_refs_resolve([orphan], [])


def test_dangling_block_def_ref_raises() -> None:
    leaf = _leaf_def("leaf", "LEAF")
    with pytest.raises(UnknownSubcktDefRefError):
        check_def_refs_resolve([leaf], [("x1", "ghost")])


def test_valid_block_def_ref_passes() -> None:
    leaf = _leaf_def("leaf", "LEAF")
    check_def_refs_resolve([leaf], [("x1", "leaf")])  # must not raise


# ---------------------------------------------------------------------------
# ir1_builder.build() integration — raises before any netlist is written
# ---------------------------------------------------------------------------


def _minimal_model(subckt_defs: list[dict], blocks: list[dict]) -> dict:
    return {
        "model": {
            "id": "m1",
            "name": "Test",
            "grid": 10,
            "params": [],
            "blocks": blocks,
            "wires": [],
            "lines": [],
            "nets": [],
            "simulation": {},
            "metadata": {},
            "subckt_defs": subckt_defs,
        }
    }


def test_build_raises_on_cyclic_subckt_defs() -> None:
    doc = _minimal_model(
        subckt_defs=[
            {
                "id": "loopy",
                "name": "LOOPY",
                "ports": [],
                "instances": [{"id": "X1", "def_ref": "loopy", "connections": []}],
                "body": "",
            }
        ],
        blocks=[],
    )
    with pytest.raises(CyclicSubcktDefError):
        build(doc)


def test_build_raises_on_dangling_block_def_ref() -> None:
    doc = _minimal_model(
        subckt_defs=[],
        blocks=[
            {
                "id": "x1",
                "type": "spice-subckt.instance",
                "paradigm": "spice-subckt",
                "domain": "physical-electrical",
                "fidelity": "spice",
                "position": [0, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {"def_ref": "ghost"},
                "ic": {},
            }
        ],
    )
    with pytest.raises(UnknownSubcktDefRefError):
        build(doc)


def test_build_succeeds_with_valid_subckt_defs() -> None:
    doc = _minimal_model(
        subckt_defs=[
            {
                "id": "leaf",
                "name": "LEAF",
                "ports": [{"id": "a", "kind": "physical-electrical"}, {"id": "b", "kind": "physical-electrical"}],
                "instances": [],
                "body": "R1 a b 1k",
            }
        ],
        blocks=[
            {
                "id": "x1",
                "type": "spice-subckt.instance",
                "paradigm": "spice-subckt",
                "domain": "physical-electrical",
                "fidelity": "spice",
                "position": [0, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {"def_ref": "leaf"},
                "ic": {},
            }
        ],
    )
    graph = build(doc)
    assert [d.id for d in graph.subckt_defs] == ["leaf"]
    assert graph.blocks[0].block_type == "spice-subckt.instance"
