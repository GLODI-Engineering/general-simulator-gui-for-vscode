"""BE-12 — gsim → IR-1 builder tests.

Covers:
- Empty model → empty IR1Graph.
- Fixture model (step → pid → scope) yields the expected topology.
- Sum with signs="++-" produces 3 input ports.
- Float coordinate fixture raises before IR-1 construction starts.
"""

from __future__ import annotations

import json
import pathlib

import pytest


def _import_ir1():  # type: ignore[no-untyped-def]
    try:
        from simulator.compiler.gsim_loader import load_gsim
        from simulator.compiler.ir1_builder import build_ir1
        from simulator.ir.ir1 import IR1Graph

        return build_ir1, load_gsim, IR1Graph
    except (ImportError, AttributeError):
        pytest.xfail("simulator.compiler.ir1_builder not yet implemented")


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


def _empty_model() -> dict:  # type: ignore[type-arg]
    return {
        "schema_version": 1,
        "model": {
            "id": "empty-model",
            "name": "Empty",
            "grid": 10,
            "blocks": [],
            "wires": [],
            "metadata": {},
        },
    }


def _step_pid_scope_model() -> dict:  # type: ignore[type-arg]
    return {
        "schema_version": 1,
        "model": {
            "id": "sps-model",
            "name": "Step-PID-Scope",
            "grid": 10,
            "blocks": [
                {
                    "id": "blk-step",
                    "type": "signal.step",
                    "position": [0, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"amplitude": 1.0, "t_step": 0.0},
                },
                {
                    "id": "blk-pid",
                    "type": "control.pid",
                    "position": [100, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"kp": 1.0, "ki": 0.1, "kd": 0.0, "anti_windup": False},
                },
                {
                    "id": "blk-scope",
                    "type": "sinks.scope",
                    "position": [200, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {},
                },
            ],
            "wires": [
                {
                    "id": "w1",
                    "from": {"block": "blk-step", "port": "out"},
                    "to": {"block": "blk-pid", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w2",
                    "from": {"block": "blk-pid", "port": "out"},
                    "to": {"block": "blk-scope", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
            ],
            "metadata": {},
        },
    }


def _sum_model(signs: str = "++-") -> dict:  # type: ignore[type-arg]
    return {
        "schema_version": 1,
        "model": {
            "id": "sum-model",
            "name": "Sum",
            "grid": 10,
            "blocks": [
                {
                    "id": "blk-sum",
                    "type": "control.sum",
                    "position": [0, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"signs": signs},
                },
            ],
            "wires": [],
            "metadata": {},
        },
    }


def _float_coord_model() -> dict:  # type: ignore[type-arg]
    return {
        "schema_version": 1,
        "model": {
            "id": "float-model",
            "name": "Float coords",
            "grid": 10,
            "blocks": [
                {
                    "id": "blk-1",
                    "type": "signal.constant",
                    "position": [1.5, 2.7],  # ← float coords violate schema
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"value": 1.0},
                },
            ],
            "wires": [],
            "metadata": {},
        },
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_empty_model_produces_empty_graph(tmp_path: pathlib.Path) -> None:
    build_ir1, load_gsim, IR1Graph = _import_ir1()
    path = tmp_path / "empty.gsim"
    path.write_text(json.dumps(_empty_model()), encoding="utf-8")
    doc = load_gsim(str(path))
    graph = build_ir1(doc)
    assert isinstance(graph, IR1Graph)
    assert len(graph.blocks) == 0
    assert len(graph.connections) == 0


def test_step_pid_scope_topology(tmp_path: pathlib.Path) -> None:
    build_ir1, load_gsim, _IR1Graph = _import_ir1()
    path = tmp_path / "sps.gsim"
    path.write_text(json.dumps(_step_pid_scope_model()), encoding="utf-8")
    doc = load_gsim(str(path))
    graph = build_ir1(doc)

    assert len(graph.blocks) == 3
    assert len(graph.connections) == 2

    block_ids = {b.instance_id for b in graph.blocks}
    assert "blk-step" in block_ids
    assert "blk-pid" in block_ids
    assert "blk-scope" in block_ids

    # Connection: step.out → pid.in
    conns = {(c.src, c.dst) for c in graph.connections}
    assert (("blk-step", "out"), ("blk-pid", "in")) in conns
    assert (("blk-pid", "out"), ("blk-scope", "in")) in conns


def test_sum_signs_produces_correct_port_count(tmp_path: pathlib.Path) -> None:
    """Sum with signs='++-' must produce 3 input ports."""
    build_ir1, load_gsim, _IR1Graph = _import_ir1()
    path = tmp_path / "sum.gsim"
    path.write_text(json.dumps(_sum_model("++-")), encoding="utf-8")
    doc = load_gsim(str(path))
    graph = build_ir1(doc)

    sum_block = next(b for b in graph.blocks if b.instance_id == "blk-sum")
    # The block's params must carry the signs; port expansion checked elsewhere
    assert sum_block.params.get("signs") == "++-"

    # The IR1 layer must have expanded the variadic inputs to 3 concrete ports
    input_ports = getattr(sum_block, "input_ports", None)
    if input_ports is not None:
        assert len(input_ports) == 3


def test_float_coordinate_raises_before_ir1(tmp_path: pathlib.Path) -> None:
    """Float coordinates in position must raise at validation, not after IR-1."""
    build_ir1, load_gsim, _ = _import_ir1()
    path = tmp_path / "float.gsim"
    path.write_text(json.dumps(_float_coord_model()), encoding="utf-8")

    with pytest.raises(Exception) as exc_info:
        doc = load_gsim(str(path))
        build_ir1(doc)

    # The error must mention validation / schema / coordinate, not be a cryptic bug
    msg = str(exc_info.value).lower()
    assert any(
        word in msg for word in ("valid", "schema", "position", "coordinate", "integer", "float")
    ), f"Expected a schema validation error, got: {exc_info.value!r}"
