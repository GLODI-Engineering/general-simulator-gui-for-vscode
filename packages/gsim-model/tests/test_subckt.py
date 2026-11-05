from __future__ import annotations

import json
import pathlib

import jsonschema
import pydantic
import pytest

from gsim_model import (
    CyclicSubcktDefError,
    DuplicateIdError,
    ModelBuilder,
    SubcktInstance,
    SubcktPort,
    UnknownSubcktDefError,
)

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
SCHEMA_PATH = (
    REPO_ROOT / "packages" / "schemas" / "definitions" / "model" / "gsim_sch.schema.json"
)


def test_add_and_instantiate_subckt_def() -> None:
    b = ModelBuilder.new("m1", "Test")
    b.add_subckt_def(
        "my_switch",
        "MY_SWITCH",
        ports=[
            SubcktPort(id="d", kind="physical-electrical"),
            SubcktPort(id="g", kind="physical-electrical"),
            SubcktPort(id="s", kind="physical-electrical"),
        ],
        body="M1 d g s s NMOS_MODEL W=1e-6 L=180e-9",
    )
    inst = b.instantiate_subckt("my_switch", position=(0, 0))

    assert inst.block.type == "spice-subckt.instance"
    assert inst.block.paradigm == "spice-subckt"
    assert inst.block.params["def_ref"] == "my_switch"
    assert inst.block.subsystem is None


def test_duplicate_subckt_def_id_rejected() -> None:
    b = ModelBuilder.new("m1", "Test")
    b.add_subckt_def("d1", "D1", ports=[])
    with pytest.raises(DuplicateIdError):
        b.add_subckt_def("d1", "D1_again", ports=[])


def test_instantiate_unknown_def_rejected() -> None:
    b = ModelBuilder.new("m1", "Test")
    with pytest.raises(UnknownSubcktDefError):
        b.instantiate_subckt("ghost", position=(0, 0))


def test_nested_subckt_defs_compose() -> None:
    b = ModelBuilder.new("m1", "Test")
    b.add_subckt_def(
        "leaf",
        "LEAF",
        ports=[SubcktPort(id="a", kind="physical-electrical"), SubcktPort(id="b", kind="physical-electrical")],
        body="R1 a b 1k",
    )
    b.add_subckt_def(
        "composite",
        "COMPOSITE",
        ports=[SubcktPort(id="p", kind="physical-electrical"), SubcktPort(id="n", kind="physical-electrical")],
        instances=[SubcktInstance(id="X1", def_ref="leaf", connections=["p", "n"])],
    )
    inst = b.instantiate_subckt("composite", position=(0, 0))
    assert inst.block.params["def_ref"] == "composite"


def test_self_referencing_def_rejected() -> None:
    b = ModelBuilder.new("m1", "Test")
    with pytest.raises(CyclicSubcktDefError):
        b.add_subckt_def(
            "loopy",
            "LOOPY",
            ports=[],
            instances=[SubcktInstance(id="X1", def_ref="loopy", connections=[])],
        )


def test_mutual_cycle_rejected() -> None:
    b = ModelBuilder.new("m1", "Test")
    b.add_subckt_def(
        "a_def", "A", ports=[], instances=[SubcktInstance(id="X1", def_ref="b_def", connections=[])]
    )
    with pytest.raises(CyclicSubcktDefError):
        b.add_subckt_def(
            "b_def",
            "B",
            ports=[],
            instances=[SubcktInstance(id="X1", def_ref="a_def", connections=[])],
        )


def test_non_physical_port_kind_rejected() -> None:
    with pytest.raises(pydantic.ValidationError):
        SubcktPort(id="sig", kind="signal")


def test_document_with_subckt_def_validates_against_schema() -> None:
    b = ModelBuilder.new("m1", "Test")
    b.add_subckt_def(
        "leaf",
        "LEAF",
        ports=[SubcktPort(id="a", kind="physical-electrical"), SubcktPort(id="b", kind="physical-electrical")],
        body="R1 a b 1k",
    )
    b.instantiate_subckt("leaf", position=(0, 0), id="x1")

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    jsonschema.validate(b.document.to_raw_dict(), schema)


def test_connectivity_stops_at_subckt_boundary() -> None:
    from gsim_model import ConnectivityGraph

    b = ModelBuilder.new("m1", "Test")
    b.add_subckt_def(
        "leaf",
        "LEAF",
        ports=[SubcktPort(id="a", kind="physical-electrical"), SubcktPort(id="b", kind="physical-electrical")],
        body="R1 a b 1k",
    )
    inst = b.instantiate_subckt("leaf", position=(0, 0), id="x1")
    other = b.add_block(
        "physical_electrical.passive.resistor",
        paradigm="physical-network",
        domain="physical-electrical",
        id="r2",
        position=(50, 0),
    )
    b.connect(inst.port("a"), other.port("p1"), kind="physical-electrical")

    graph = ConnectivityGraph.from_document(b.document)
    # The visible port is reachable...
    assert graph.is_connected(inst.port("a"), other.port("p1"))
    # ...but nothing inside the subckt body (e.g. a hypothetical internal
    # node named "a_internal") is ever a graph node at all.
    assert graph.neighbors("x1", "a_internal") == []
