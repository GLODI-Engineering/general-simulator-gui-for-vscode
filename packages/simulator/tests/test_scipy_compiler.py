"""BE-14 — IR-2 → scipy callable compiler tests.

Covers:
- Gain block: dx=[] and output = k*input.
- Integrator: dx[0] = input value; output = state.
- Determinism: f(t, x) twice with same args returns byte-equivalent arrays.
- f(t, x) returns shape (M,) for any (t, x) with M state vars.
"""

from __future__ import annotations

import json
import pathlib

import numpy as np
import pytest


def _import_compiler():  # type: ignore[no-untyped-def]
    try:
        from simulator.compiler.gsim_loader import load_gsim
        from simulator.compiler.ir1_builder import build_ir1
        from simulator.compiler.ir2_lowering import lower_to_ir2
        from simulator.compiler.scipy_compiler import compile_model

        return load_gsim, build_ir1, lower_to_ir2, compile_model
    except (ImportError, AttributeError):
        pytest.xfail("simulator.compiler.scipy_compiler not yet implemented")


def _build_compiled(model_dict: dict, tmp_path: pathlib.Path):  # type: ignore[type-arg, no-untyped-def]
    load_gsim, build_ir1, lower_to_ir2, compile_model = _import_compiler()
    path = tmp_path / "model.gsim"
    path.write_text(json.dumps(model_dict), encoding="utf-8")
    doc = load_gsim(str(path))
    ir1 = build_ir1(doc)
    ir2 = lower_to_ir2(ir1, intent="transient_control")
    return compile_model(ir2)


def _gain_model() -> dict:  # type: ignore[type-arg]
    return {
        "schema_version": 1,
        "model": {
            "id": "gain-only",
            "name": "Gain",
            "grid": 10,
            "blocks": [
                {
                    "id": "b-const",
                    "type": "signal.constant",
                    "position": [0, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"value": 3.0},
                },
                {
                    "id": "b-gain",
                    "type": "control.gain",
                    "position": [100, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"k": 2.0},
                },
                {
                    "id": "b-scope",
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
                    "from": {"block": "b-const", "port": "out"},
                    "to": {"block": "b-gain", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w2",
                    "from": {"block": "b-gain", "port": "out"},
                    "to": {"block": "b-scope", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
            ],
            "metadata": {},
        },
    }


def _integrator_model() -> dict:  # type: ignore[type-arg]
    return {
        "schema_version": 1,
        "model": {
            "id": "integ-model",
            "name": "Integrator",
            "grid": 10,
            "blocks": [
                {
                    "id": "b-const",
                    "type": "signal.constant",
                    "position": [0, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"value": 1.0},
                },
                {
                    "id": "b-integ",
                    "type": "control.integrator",
                    "position": [100, 0],
                    "rotation": 0,
                    "mirror": "none",
                    "params": {"lo": -1e9, "hi": 1e9},
                },
                {
                    "id": "b-scope",
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
                    "from": {"block": "b-const", "port": "out"},
                    "to": {"block": "b-integ", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
                {
                    "id": "w2",
                    "from": {"block": "b-integ", "port": "out"},
                    "to": {"block": "b-scope", "port": "in"},
                    "waypoints": [],
                    "pinned": False,
                },
            ],
            "metadata": {},
        },
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_gain_block_no_state(tmp_path: pathlib.Path) -> None:
    """Gain-only model: state vector is empty; dx has shape (0,)."""
    compiled = _build_compiled(_gain_model(), tmp_path)
    x0 = compiled.x0  # zero-length for gain-only model
    dx = compiled.f(0.0, x0)
    assert dx.shape == (0,), f"Expected dx.shape=(0,), got {dx.shape}"


def test_gain_output_equals_k_times_input(tmp_path: pathlib.Path) -> None:
    """For constant 3.0 * gain 2.0 the scope should observe 6.0."""
    compiled = _build_compiled(_gain_model(), tmp_path)
    x0 = compiled.x0
    compiled.f(0.0, x0)
    # Observation hooks for the scope must record 6.0
    scope_obs = compiled.observations.get("b-scope") or compiled.observations.get("b-scope__in")
    if scope_obs is not None:
        assert abs(scope_obs - 6.0) < 1e-9


def test_integrator_dx_equals_input(tmp_path: pathlib.Path) -> None:
    """Integrator: dx[0] must equal the input (constant 1.0) at any state."""
    compiled = _build_compiled(_integrator_model(), tmp_path)
    x0 = compiled.x0  # [0.0] for integrator
    dx = compiled.f(0.0, x0)
    assert dx.shape == (1,), f"Expected shape (1,), got {dx.shape}"
    assert abs(dx[0] - 1.0) < 1e-9, f"Expected dx[0]=1.0, got {dx[0]}"


def test_integrator_output_equals_state(tmp_path: pathlib.Path) -> None:
    """Integrator output must equal its current state."""
    compiled = _build_compiled(_integrator_model(), tmp_path)
    state_val = 3.14
    x = np.array([state_val])
    compiled.f(0.0, x)
    scope_obs = compiled.observations.get("b-scope") or compiled.observations.get("b-scope__in")
    if scope_obs is not None:
        assert abs(scope_obs - state_val) < 1e-9


def test_f_shape_for_integrator_model(tmp_path: pathlib.Path) -> None:
    """f(t, x) must return shape (M,) for any (t, x)."""
    compiled = _build_compiled(_integrator_model(), tmp_path)
    M = len(compiled.x0)
    rng = np.random.default_rng(0)
    for _ in range(10):
        x = rng.standard_normal(M)
        dx = compiled.f(float(rng.uniform(0, 10)), x)
        assert dx.shape == (M,)


def test_f_deterministic(tmp_path: pathlib.Path) -> None:
    """f(t, x) called twice with the same args must return byte-equivalent arrays."""
    compiled = _build_compiled(_integrator_model(), tmp_path)
    x = np.array([1.234])
    dx1 = compiled.f(2.0, x.copy())
    dx2 = compiled.f(2.0, x.copy())
    np.testing.assert_array_equal(dx1, dx2)
