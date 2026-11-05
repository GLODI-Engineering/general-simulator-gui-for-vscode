"""Tests for IR1 builder (BE-31)."""

from __future__ import annotations

from simulator.compiler.gsim_sch_loader import ModelDocument
from simulator.compiler.ir1_builder import build as build_ir1


def test_ir1_block_paradigm() -> None:
    """A v2 doc with one signal-flow.math.gain block builds an IR1Block whose paradigm='signal-flow' and domain='signal'."""
    model = {
        "id": "test-model",
        "name": "Test",
        "grid": 10,
        "blocks": [
            {
                "id": "blk-gain",
                "type": "signal-flow.math.gain",
                "position": [0, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {"k": 2.0},
            }
        ],
        "wires": [],
        "metadata": {},
    }
    doc = ModelDocument(schema_version=2, model=model, resolved_params={})
    graph = build_ir1(doc)

    assert len(graph.blocks) == 1
    block = graph.blocks[0]
    assert block.instance_id == "blk-gain"
    assert block.paradigm == "signal-flow"
    assert block.domain == "signal"


def test_ir1_block_fidelity() -> None:
    """A physical-electrical.passive.resistor block carries fidelity from the source doc."""
    model = {
        "id": "test-model",
        "name": "Test",
        "grid": 10,
        "blocks": [
            {
                "id": "blk-res",
                "type": "physical-electrical.passive.resistor",
                "fidelity": "spice",
                "position": [0, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {"r": 1000},
            }
        ],
        "wires": [],
        "metadata": {},
    }
    doc = ModelDocument(schema_version=2, model=model, resolved_params={})
    graph = build_ir1(doc)

    assert len(graph.blocks) == 1
    block = graph.blocks[0]
    assert block.instance_id == "blk-res"
    assert block.fidelity == "spice"


def test_ir1_connection_kind() -> None:
    """A wire's IR1Connection.kind matches the source endpoint's port kind."""
    model = {
        "id": "test-model",
        "name": "Test",
        "grid": 10,
        "blocks": [
            {
                "id": "blk-1",
                "type": "some.type",
                "position": [0, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {},
            },
            {
                "id": "blk-2",
                "type": "some.other.type",
                "position": [100, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {},
            },
        ],
        "wires": [
            {
                "id": "w1",
                "from": {"block": "blk-1", "port": "p1"},
                "to": {"block": "blk-2", "port": "p2"},
                "kind": "power",
                "waypoints": [],
                "pinned": False,
            }
        ],
        "metadata": {},
    }
    doc = ModelDocument(schema_version=2, model=model, resolved_params={})
    graph = build_ir1(doc)

    assert len(graph.connections) == 1
    conn = graph.connections[0]
    assert conn.kind == "power"


def test_ir1_named_net() -> None:
    """A wire with net='vout' produces an IR1Connection.net='vout' and an IR1Net entry with the right kind."""
    model = {
        "id": "test-model",
        "name": "Test",
        "grid": 10,
        "blocks": [
            {
                "id": "b1",
                "type": "t",
                "position": [0, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {},
            },
            {
                "id": "b2",
                "type": "t",
                "position": [10, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {},
            },
        ],
        "wires": [
            {
                "id": "w1",
                "from": {"block": "b1", "port": "out"},
                "to": {"block": "b2", "port": "in"},
                "kind": "electrical",
                "net": "vout",
                "waypoints": [],
                "pinned": False,
            }
        ],
        "nets": [{"name": "vout", "kind": "electrical", "scope": "local"}],
        "metadata": {},
    }
    doc = ModelDocument(schema_version=2, model=model, resolved_params={})
    graph = build_ir1(doc)

    assert len(graph.connections) == 1
    assert graph.connections[0].net == "vout"

    assert len(graph.nets) == 1
    net = graph.nets[0]
    assert net.name == "vout"
    assert net.kind == "electrical"
    assert net.scope == "local"


def test_ir1_simulation_directive() -> None:
    """A v2 doc with two analyses populates IR1SimulationDirective.analyses with both entries in order."""
    model = {
        "id": "test-model",
        "name": "Test",
        "grid": 10,
        "blocks": [],
        "wires": [],
        "simulation": {
            "analyses": [
                {"type": "operating-point", "id": "op1"},
                {"type": "transient", "id": "tran1", "t_stop": 0.1},
            ]
        },
        "metadata": {},
    }
    doc = ModelDocument(schema_version=2, model=model, resolved_params={})
    graph = build_ir1(doc)

    assert len(graph.simulation.analyses) == 2
    assert graph.simulation.analyses[0]["type"] == "operating-point"
    assert graph.simulation.analyses[1]["type"] == "transient"
    assert graph.simulation.analyses[1]["t_stop"] == 0.1
