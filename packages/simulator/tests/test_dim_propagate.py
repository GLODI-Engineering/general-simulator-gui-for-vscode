"""Tests for signal-dimension propagation pass (BE-43)."""

from __future__ import annotations

import pytest

from simulator.compiler.dim_propagate import (
    DimensionLoopError,
    DimensionMismatchError,
    DimensionUnresolvedError,
    propagate_dims,
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
    kind: str = "signal",
) -> IR1Connection:
    return IR1Connection(src=(src_block, src_port), dst=(dst_block, dst_port), kind=kind)


def test_dim_scalar_chain() -> None:
    graph = IR1Graph(
        blocks=[
            _b("const", "signal-flow.source.constant", {"value": 1}),
            _b("gain", "signal-flow.math.gain", {"k": 2.0}),
            _b("integ", "signal-flow.continuous.integrator", {}),
            _b("scope", "signal-flow.sink.scope", {}),
        ],
        connections=[
            _c("const", "out", "gain", "in"),
            _c("gain", "out", "integ", "in"),
            _c("integ", "out", "scope", "in"),
        ],
    )

    out = propagate_dims(graph)
    assert [conn.dim for conn in out.connections] == [[1], [1], [1]]


def test_dim_vector_chain() -> None:
    graph = IR1Graph(
        blocks=[
            _b("const", "signal-flow.source.constant", {"value": [1, 2, 3]}),
            _b("gain", "signal-flow.math.gain", {"k": 3.0}),
            _b("scope", "signal-flow.sink.scope", {}),
        ],
        connections=[
            _c("const", "out", "gain", "in"),
            _c("gain", "out", "scope", "in"),
        ],
    )

    out = propagate_dims(graph)
    assert [conn.dim for conn in out.connections] == [[3], [3]]


def test_dim_mux_sum() -> None:
    graph = IR1Graph(
        blocks=[
            _b("c3", "signal-flow.source.constant", {"value": [1, 2, 3]}),
            _b("c2", "signal-flow.source.constant", {"value": [10, 20]}),
            _b("mux", "signal-flow.routing.mux", {"n_inputs": 2}),
            _b("scope", "signal-flow.sink.scope", {}),
        ],
        connections=[
            _c("c3", "out", "mux", "in0"),
            _c("c2", "out", "mux", "in1"),
            _c("mux", "out", "scope", "in"),
        ],
    )

    out = propagate_dims(graph)
    assert out.connections[0].dim == [3]
    assert out.connections[1].dim == [2]
    assert out.connections[2].dim == [5]


def test_dim_demux_partition() -> None:
    graph = IR1Graph(
        blocks=[
            _b("c5", "signal-flow.source.constant", {"value": [1, 2, 3, 4, 5]}),
            _b("demux", "signal-flow.routing.demux", {"outputs": [2, 3]}),
            _b("scope2", "signal-flow.sink.scope", {}),
            _b("scope3", "signal-flow.sink.scope", {}),
        ],
        connections=[
            _c("c5", "out", "demux", "in"),
            _c("demux", "out0", "scope2", "in"),
            _c("demux", "out1", "scope3", "in"),
        ],
    )

    out = propagate_dims(graph)
    assert out.connections[0].dim == [5]
    assert out.connections[1].dim == [2]
    assert out.connections[2].dim == [3]


def test_dim_spec_pins() -> None:
    graph_ok = IR1Graph(
        blocks=[
            _b("c4", "signal-flow.source.constant", {"value": [1, 2, 3, 4]}),
            _b("up", "signal-flow.math.gain", {"k": 1.0}),
            _b("spec", "signal-flow.attributes.signal_specification", {"dim": [4]}),
            _b("down", "signal-flow.math.gain", {"k": 1.0}),
            _b("scope", "signal-flow.sink.scope", {}),
        ],
        connections=[
            _c("c4", "out", "up", "in"),
            _c("up", "out", "spec", "in"),
            _c("spec", "out", "down", "in"),
            _c("down", "out", "scope", "in"),
        ],
    )

    out = propagate_dims(graph_ok)
    assert [conn.dim for conn in out.connections] == [[4], [4], [4], [4]]

    graph_bad = IR1Graph(
        blocks=[
            _b("c3", "signal-flow.source.constant", {"value": [1, 2, 3]}),
            _b("up", "signal-flow.math.gain", {"k": 1.0}),
            _b("spec", "signal-flow.attributes.signal_specification", {"dim": [4]}),
            _b("scope", "signal-flow.sink.scope", {}),
        ],
        connections=[
            _c("c3", "out", "up", "in"),
            _c("up", "out", "spec", "in"),
            _c("spec", "out", "scope", "in"),
        ],
    )

    with pytest.raises(DimensionMismatchError):
        propagate_dims(graph_bad)


def test_dim_unresolved() -> None:
    graph = IR1Graph(
        blocks=[
            _b("g1", "signal-flow.math.gain", {"k": 1.0}),
            _b("g2", "signal-flow.math.gain", {"k": 1.0}),
            _b("scope", "signal-flow.sink.scope", {}),
        ],
        connections=[
            _c("g1", "out", "g2", "in"),
            _c("g2", "out", "scope", "in"),
        ],
    )

    with pytest.raises(DimensionUnresolvedError):
        propagate_dims(graph)


def test_dim_loop() -> None:
    graph = IR1Graph(
        blocks=[
            _b("a", "signal-flow.math.gain", {"k": 1.0}),
            _b("b", "signal-flow.math.gain", {"k": 1.0}),
            _b("c", "signal-flow.math.gain", {"k": 1.0}),
        ],
        connections=[
            _c("a", "out", "b", "in"),
            _c("b", "out", "c", "in"),
            _c("c", "out", "a", "in"),
        ],
    )

    with pytest.raises(DimensionLoopError) as exc:
        propagate_dims(graph)

    msg = str(exc.value)
    assert "a" in msg
    assert "b" in msg
    assert "c" in msg


def test_dim_acausal_skipped() -> None:
    graph = IR1Graph(
        blocks=[
            _b("src", "physical-electrical.source.voltage_dc", {"v": 5.0}),
            _b("res", "physical-electrical.passive.resistor", {"r": 1000.0}),
        ],
        connections=[
            _c("src", "p", "res", "p", kind="physical-electrical"),
        ],
    )

    out = propagate_dims(graph)
    assert out.connections[0].dim is None
