"""BE-42 — routing_lower tests."""

from __future__ import annotations

import pytest

from simulator.compiler.routing_lower import (
    SelectorOutOfRangeError,
    UnresolvedDataStoreError,
    routing_lower,
)
from simulator.ir.ir1 import IR1Block, IR1Connection, IR1Graph


def _b(instance_id: str, block_type: str, params: dict | None = None) -> IR1Block:
    return IR1Block(instance_id=instance_id, block_type=block_type, params=params or {})


def _c(
    src_block: str,
    src_port: str,
    dst_block: str,
    dst_port: str,
    *,
    dim: list[int] | None = None,
) -> IR1Connection:
    return IR1Connection(src=(src_block, src_port), dst=(dst_block, dst_port), dim=dim)


def test_mux_gather() -> None:
    graph = IR1Graph(blocks=[_b("mux", "signal-flow.routing.mux", {"n_inputs": 2})])
    plan = routing_lower(graph)

    out = plan.compute("mux", {"in0": [1, 2, 3], "in1": [4, 5]})
    assert out["out"] == [1, 2, 3, 4, 5]


def test_demux_partition() -> None:
    graph = IR1Graph(
        blocks=[_b("demux", "signal-flow.routing.demux", {"outputs": [2, 3]})],
    )
    plan = routing_lower(graph)

    out = plan.compute("demux", {"in": [1, 2, 3, 4, 5]})
    assert out["out0"] == [1, 2]
    assert out["out1"] == [3, 4, 5]


def test_selector_indices() -> None:
    graph = IR1Graph(
        blocks=[_b("sel", "signal-flow.routing.selector", {"indices": [0, 2, 4]})],
    )
    plan = routing_lower(graph)

    out = plan.compute("sel", {"in": [10, 20, 30, 40, 50]})
    assert out["out"] == [10, 30, 50]


def test_selector_out_of_range() -> None:
    graph = IR1Graph(
        blocks=[
            _b("src", "signal-flow.source.constant", {"value": [1, 2, 3]}),
            _b("sel", "signal-flow.routing.selector", {"indices": [0, 5]}),
        ],
        connections=[_c("src", "out", "sel", "in", dim=[3])],
    )

    with pytest.raises(SelectorOutOfRangeError):
        routing_lower(graph)


def test_bus_creator_selector_roundtrip() -> None:
    graph = IR1Graph(
        blocks=[
            _b("creator", "signal-flow.routing.bus_creator", {"elements": ["x", "y", "z"]}),
            _b("selector", "signal-flow.routing.bus_selector", {"elements": ["x", "z"]}),
        ]
    )
    plan = routing_lower(graph)

    created = plan.compute("creator", {"x": 1.0, "y": [2, 3], "z": 4.0})
    selected = plan.compute("selector", {"bus": created["bus"]})

    assert selected["x"] == [1.0]
    assert selected["z"] == [4.0]


def test_switch_threshold() -> None:
    graph = IR1Graph(
        blocks=[
            _b(
                "sw",
                "signal-flow.routing.switch",
                {"criteria": ">=", "threshold": 0},
            )
        ]
    )
    plan = routing_lower(graph)

    picked_in1 = plan.compute("sw", {"in0": "zero", "in1": "one", "control": 1})
    picked_in0 = plan.compute("sw", {"in0": "zero", "in1": "one", "control": -1})

    assert picked_in1["out"] == "one"
    assert picked_in0["out"] == "zero"


def test_multiport_switch_clamp() -> None:
    graph = IR1Graph(
        blocks=[_b("msw", "signal-flow.routing.multiport_switch", {"n_inputs": 4})],
    )
    plan = routing_lower(graph)

    out = plan.compute(
        "msw",
        {"control": 10.7, "in0": "a", "in1": "b", "in2": "c", "in3": "d"},
    )
    assert out["out"] == "d"


def test_data_store_round_trip() -> None:
    graph = IR1Graph(
        blocks=[
            _b(
                "mem",
                "signal-flow.routing.data_store_memory",
                {"name": "ds", "initial_value": 0.0, "dim": [1]},
            ),
            _b("wr", "signal-flow.routing.data_store_write", {"name": "ds"}),
            _b("rd", "signal-flow.routing.data_store_read", {"name": "ds"}),
        ]
    )
    plan = routing_lower(graph)

    # Step k: write value.
    plan.compute("wr", {"in": 123.0})
    plan.commit_writes()

    # Step k+1: read value.
    out = plan.compute("rd", {})
    assert out["out"] == 123.0


def test_data_store_unknown() -> None:
    graph = IR1Graph(
        blocks=[_b("rd", "signal-flow.routing.data_store_read", {"name": "missing"})],
    )

    with pytest.raises(UnresolvedDataStoreError):
        routing_lower(graph)
