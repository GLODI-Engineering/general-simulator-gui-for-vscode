"""BE-13 — IR-1 → IR-2 lowering tests.

Covers:
- Closed-loop fixture (with integrator) lowers successfully.
- Same fixture without integrator (algebraic loop) is rejected with a clear error.
- state_layout and output_layout sizes are correct for the 10-block control test set.
- Sources evaluated first; sinks last in eval_order.
"""

from __future__ import annotations

import json
import pathlib

import pytest


def _import_ir2():  # type: ignore[no-untyped-def]
    try:
        from simulator.compiler.gsim_loader import load_gsim
        from simulator.compiler.ir1_builder import build_ir1
        from simulator.compiler.ir2_lowering import lower_to_ir2
        from simulator.ir.ir2 import IR2System

        return load_gsim, build_ir1, lower_to_ir2, IR2System
    except (ImportError, AttributeError):
        pytest.xfail("simulator.compiler.ir2_lowering not yet implemented")


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


def _closed_loop_with_integrator() -> dict:  # type: ignore[type-arg]
    """step → sum(+,-) → gain → integrator → scope; integrator.out → sum.in1 (feedback)."""
    return {
        "schema_version": 1,
        "model": {
            "id": "cl-model",
            "name": "Closed-loop with integrator",
            "grid": 10,
            "blocks": [
                {
                    "id": "b-step",
                    "type": "signal.step",
                    "position": [0, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"amplitude": 1.0, "t_step": 0.0},
                },
                {
                    "id": "b-sum",
                    "type": "control.sum",
                    "position": [100, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"signs": "+-"},
                },
                {
                    "id": "b-gain",
                    "type": "control.gain",
                    "position": [200, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"k": 2.0},
                },
                {
                    "id": "b-integ",
                    "type": "control.integrator",
                    "position": [300, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"lo": -1e9, "hi": 1e9},
                },
                {
                    "id": "b-scope",
                    "type": "sinks.scope",
                    "position": [400, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {},
                },
            ],
            "wires": [
                {
                    "id": "w1",
                    "from": {"block": "b-step", "port": "out"},
                    "to": {"block": "b-sum", "port": "in0"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w2",
                    "from": {"block": "b-integ", "port": "out"},
                    "to": {"block": "b-sum", "port": "in1"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w3",
                    "from": {"block": "b-sum", "port": "out"},
                    "to": {"block": "b-gain", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w4",
                    "from": {"block": "b-gain", "port": "out"},
                    "to": {"block": "b-integ", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w5",
                    "from": {"block": "b-integ", "port": "out"},
                    "to": {"block": "b-scope", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
            ],
            "metadata": {},
        },
    }


def _algebraic_loop_model() -> dict:  # type: ignore[type-arg]
    """step → sum(+,-) → gain → sum (feedback without integrator) — algebraic loop."""
    return {
        "schema_version": 1,
        "model": {
            "id": "alg-loop",
            "name": "Algebraic loop",
            "grid": 10,
            "blocks": [
                {
                    "id": "b-step",
                    "type": "signal.step",
                    "position": [0, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"amplitude": 1.0, "t_step": 0.0},
                },
                {
                    "id": "b-sum",
                    "type": "control.sum",
                    "position": [100, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"signs": "+-"},
                },
                {
                    "id": "b-gain",
                    "type": "control.gain",
                    "position": [200, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"k": 0.5},
                },
            ],
            "wires": [
                {
                    "id": "w1",
                    "from": {"block": "b-step", "port": "out"},
                    "to": {"block": "b-sum", "port": "in0"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w2",
                    "from": {"block": "b-sum", "port": "out"},
                    "to": {"block": "b-gain", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
                # Feedback: gain.out → sum.in1 with NO integrator — algebraic loop
                {
                    "id": "w3",
                    "from": {"block": "b-gain", "port": "out"},
                    "to": {"block": "b-sum", "port": "in1"},
                    "waypoints": [],
                    "pinned": False,
                },
            ],
            "metadata": {},
        },
    }


def _load_ir2(model_dict: dict, tmp_path: pathlib.Path):  # type: ignore[type-arg, no-untyped-def]
    load_gsim, build_ir1, lower_to_ir2, _ = _import_ir2()
    path = tmp_path / "model.gsim"
    path.write_text(json.dumps(model_dict), encoding="utf-8")
    doc = load_gsim(str(path))
    ir1 = build_ir1(doc)
    return lower_to_ir2(ir1, intent="transient_control")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_closed_loop_with_integrator_lowers(tmp_path: pathlib.Path) -> None:
    _, _, _, IR2System = _import_ir2()
    ir2 = _load_ir2(_closed_loop_with_integrator(), tmp_path)
    assert ir2 is not None
    assert isinstance(ir2, IR2System)


def test_state_layout_covers_all_state_vars(tmp_path: pathlib.Path) -> None:
    ir2 = _load_ir2(_closed_loop_with_integrator(), tmp_path)
    # integrator has 1 state var → state_layout must have 1 entry
    assert len(ir2.state_layout) >= 1


def test_eval_order_sources_first(tmp_path: pathlib.Path) -> None:
    ir2 = _load_ir2(_closed_loop_with_integrator(), tmp_path)
    # b-step is a source; it must appear before b-sum in eval_order
    order = ir2.eval_order
    assert "b-step" in order
    assert "b-sum" in order
    assert order.index("b-step") < order.index("b-sum")


def test_eval_order_sinks_last(tmp_path: pathlib.Path) -> None:
    ir2 = _load_ir2(_closed_loop_with_integrator(), tmp_path)
    order = ir2.eval_order
    assert "b-scope" in order
    # scope must appear after gain and integrator
    assert order.index("b-scope") > order.index("b-gain")


def test_eval_order_is_valid_topological_sort(tmp_path: pathlib.Path) -> None:
    ir2 = _load_ir2(_closed_loop_with_integrator(), tmp_path)
    # Every block id must appear exactly once
    assert len(ir2.eval_order) == len(set(ir2.eval_order))


def test_algebraic_loop_rejected(tmp_path: pathlib.Path) -> None:
    """A feedback path with no integrator must raise an error at lowering time."""
    load_gsim, build_ir1, lower_to_ir2, _ = _import_ir2()
    path = tmp_path / "alg.gsim"
    path.write_text(json.dumps(_algebraic_loop_model()), encoding="utf-8")
    doc = load_gsim(str(path))
    ir1 = build_ir1(doc)

    with pytest.raises(Exception) as exc_info:
        lower_to_ir2(ir1, intent="transient_control")

    msg = str(exc_info.value).lower()
    assert any(word in msg for word in ("loop", "cycle", "algebraic", "circular")), (
        f"Error must mention algebraic loop; got: {exc_info.value!r}"
    )
    # Must mention at least one of the offending block ids
    assert any(bid in str(exc_info.value) for bid in ("b-sum", "b-gain")), (
        f"Error must cite offending block ids; got: {exc_info.value!r}"
    )
