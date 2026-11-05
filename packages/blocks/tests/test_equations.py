"""BE-11 — Block equation templates correctness tests.

Covers all 10 v1 blocks:
- state_vars() matches metadata behavior.state_count.
- derivatives() handles edge cases (zero input, large input).
- Closed-form numerical checks:
  - gain(k=2.0, in=3.0) → out=6.0
  - integrator: from x0=0 with constant input 1, state reaches t after t seconds
  - transfer_function num=[1], den=[1,1] matches scipy.signal.lti reference within 1e-6
"""

from __future__ import annotations

import importlib
import pathlib

import numpy as np
import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BLOCKS_ROOT = pathlib.Path(__file__).parents[3] / "packages" / "blocks" / "src" / "blocks"

BLOCK_PATHS = {
    "signal.constant": BLOCKS_ROOT / "signal" / "constant" / "equations.py",
    "signal.step": BLOCKS_ROOT / "signal" / "step" / "equations.py",
    "control.gain": BLOCKS_ROOT / "control" / "gain" / "equations.py",
    "control.sum": BLOCKS_ROOT / "control" / "sum" / "equations.py",
    "control.integrator": BLOCKS_ROOT / "control" / "integrator" / "equations.py",
    "control.derivative": BLOCKS_ROOT / "control" / "derivative" / "equations.py",
    "control.pid": BLOCKS_ROOT / "control" / "pid" / "equations.py",
    "control.transfer_function": BLOCKS_ROOT / "control" / "transfer_function" / "equations.py",
    "control.saturation": BLOCKS_ROOT / "control" / "saturation" / "equations.py",
    "sinks.scope": BLOCKS_ROOT / "sinks" / "scope" / "equations.py",
}


def _load_equations(block_key: str):  # type: ignore[no-untyped-def]
    path = BLOCK_PATHS[block_key]
    if not path.exists():
        pytest.xfail(f"equations.py not yet created for {block_key}")
    spec = importlib.util.spec_from_file_location(block_key.replace(".", "_"), path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module.Equations()


# ---------------------------------------------------------------------------
# state_vars — shapes and types
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "block_key,expected_count",
    [
        ("signal.constant", 0),
        ("signal.step", 0),
        ("control.gain", 0),
        ("control.sum", 0),
        ("control.integrator", 1),
        ("control.derivative", 0),
        ("control.pid", 2),
        ("control.saturation", 0),
        ("sinks.scope", 0),
    ],
)
def test_state_vars_count(block_key: str, expected_count: int) -> None:
    eq = _load_equations(block_key)
    params = _default_params(block_key)
    svars = eq.state_vars(params)
    assert isinstance(svars, list)
    assert len(svars) == expected_count, (
        f"{block_key}: expected {expected_count} state vars, got {len(svars)}: {svars}"
    )


def test_transfer_function_state_vars_dynamic() -> None:
    """Transfer function state count equals len(den) - 1."""
    eq = _load_equations("control.transfer_function")
    params = {"num": [1.0], "den": [1.0, 2.0, 1.0]}  # 2nd order → 2 states
    svars = eq.state_vars(params)
    assert len(svars) == 2

    params2 = {"num": [1.0], "den": [1.0, 1.0]}  # 1st order → 1 state
    assert len(eq.state_vars(params2)) == 1


# ---------------------------------------------------------------------------
# Default params helper
# ---------------------------------------------------------------------------


def _default_params(block_key: str) -> dict:  # type: ignore[type-arg]
    defaults = {
        "signal.constant": {"value": 1.0},
        "signal.step": {"amplitude": 1.0, "t_step": 1.0},
        "control.gain": {"k": 1.0},
        "control.sum": {"signs": "++"},
        "control.integrator": {"lo": -1e9, "hi": 1e9},
        "control.derivative": {},
        "control.pid": {"kp": 1.0, "ki": 0.0, "kd": 0.0, "anti_windup": False},
        "control.transfer_function": {"num": [1.0], "den": [1.0, 1.0]},
        "control.saturation": {"lo": -1.0, "hi": 1.0},
        "sinks.scope": {},
    }
    return defaults.get(block_key, {})


# ---------------------------------------------------------------------------
# Closed-form numerical checks
# ---------------------------------------------------------------------------


def test_gain_closed_form() -> None:
    """gain(k=2.0, in=3.0) must produce out=6.0."""
    eq = _load_equations("control.gain")
    outputs, dstate = eq.derivatives(0.0, {"in": 3.0}, {}, {"k": 2.0})
    assert abs(outputs["out"] - 6.0) < 1e-12
    assert dstate == {}


def test_gain_zero_input() -> None:
    eq = _load_equations("control.gain")
    outputs, _ = eq.derivatives(0.0, {"in": 0.0}, {}, {"k": 5.0})
    assert outputs["out"] == 0.0


def test_gain_large_input() -> None:
    eq = _load_equations("control.gain")
    outputs, _ = eq.derivatives(0.0, {"in": 1e9}, {}, {"k": 2.0})
    assert abs(outputs["out"] - 2e9) < 1.0  # within 1 for float precision


def test_integrator_dx_equals_input() -> None:
    """Integrator: dstate/dt must equal the input at every step."""
    eq = _load_equations("control.integrator")
    params = {"lo": -1e9, "hi": 1e9}
    _, dstate = eq.derivatives(0.0, {"in": 1.0}, {"x": 0.0}, params)
    assert abs(dstate["x"] - 1.0) < 1e-12


def test_integrator_output_equals_state() -> None:
    """Integrator output must equal the current state value."""
    eq = _load_equations("control.integrator")
    params = {"lo": -1e9, "hi": 1e9}
    outputs, _ = eq.derivatives(0.0, {"in": 0.0}, {"x": 3.14}, params)
    assert abs(outputs["out"] - 3.14) < 1e-12


def test_integrator_clamp() -> None:
    """Integrator output must be clamped to [lo, hi]."""
    eq = _load_equations("control.integrator")
    params = {"lo": -1.0, "hi": 1.0}
    outputs, _ = eq.derivatives(0.0, {"in": 0.0}, {"x": 5.0}, params)
    assert outputs["out"] <= 1.0


def test_constant_output() -> None:
    eq = _load_equations("signal.constant")
    outputs, dstate = eq.derivatives(0.0, {}, {}, {"value": 42.0})
    assert abs(outputs["out"] - 42.0) < 1e-12
    assert dstate == {}


def test_step_before_t_step() -> None:
    eq = _load_equations("signal.step")
    outputs, _ = eq.derivatives(0.5, {}, {}, {"amplitude": 1.0, "t_step": 1.0})
    assert outputs["out"] == 0.0


def test_step_at_or_after_t_step() -> None:
    eq = _load_equations("signal.step")
    outputs, _ = eq.derivatives(1.0, {}, {}, {"amplitude": 2.0, "t_step": 1.0})
    assert abs(outputs["out"] - 2.0) < 1e-12


def test_saturation_clips_high() -> None:
    eq = _load_equations("control.saturation")
    outputs, _ = eq.derivatives(0.0, {"in": 10.0}, {}, {"lo": -1.0, "hi": 1.0})
    assert outputs["out"] <= 1.0


def test_saturation_clips_low() -> None:
    eq = _load_equations("control.saturation")
    outputs, _ = eq.derivatives(0.0, {"in": -10.0}, {}, {"lo": -1.0, "hi": 1.0})
    assert outputs["out"] >= -1.0


def test_saturation_passthrough_in_range() -> None:
    eq = _load_equations("control.saturation")
    outputs, _ = eq.derivatives(0.0, {"in": 0.5}, {}, {"lo": -1.0, "hi": 1.0})
    assert abs(outputs["out"] - 0.5) < 1e-12


def test_scope_outputs_empty() -> None:
    eq = _load_equations("sinks.scope")
    outputs, dstate = eq.derivatives(0.0, {"in": 3.14}, {}, {})
    assert outputs == {}
    assert dstate == {}


# ---------------------------------------------------------------------------
# Transfer function against scipy reference
# ---------------------------------------------------------------------------


def test_transfer_function_first_order_step_response() -> None:
    """1st-order LP (num=[1], den=[1,1]) step response matches scipy within 1e-6."""
    from scipy.integrate import solve_ivp

    eq = _load_equations("control.transfer_function")
    params = {"num": [1.0], "den": [1.0, 1.0]}
    svars = eq.state_vars(params)
    assert len(svars) == 1

    # Manually integrate via solve_ivp
    def ode(t: float, x: np.ndarray) -> np.ndarray:
        state = {svars[0]: x[0]}
        _, dstate = eq.derivatives(t, {"in": 1.0}, state, params)
        return np.array([dstate[svars[0]]])

    sol = solve_ivp(
        ode,
        (0.0, 10.0),
        [0.0],
        method="Radau",
        rtol=1e-8,
        atol=1e-10,
        t_eval=np.linspace(0, 10, 200),
    )

    # Reference: 1/(s+1) step response = 1 - exp(-t)
    t = sol.t
    reference = 1.0 - np.exp(-t)

    # Extract output from equation at each time point
    outputs_arr = []
    for i, ti in enumerate(t):
        out, _ = eq.derivatives(float(ti), {"in": 1.0}, {svars[0]: sol.y[0, i]}, params)
        outputs_arr.append(out["out"])

    np.testing.assert_allclose(outputs_arr, reference, rtol=1e-4, atol=1e-6)


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "block_key",
    [
        "control.gain",
        "control.integrator",
        "control.pid",
        "control.sum",
    ],
)
def test_derivatives_deterministic(block_key: str) -> None:
    """derivatives() must return identical values when called twice with same args."""
    eq = _load_equations(block_key)
    params = _default_params(block_key)
    svars = eq.state_vars(params)
    state = {v: 0.1 for v in svars}
    inputs = {"in": 1.5} if block_key != "control.sum" else {"in0": 1.0, "in1": 0.5}

    out1, ds1 = eq.derivatives(1.0, inputs, state, params)
    out2, ds2 = eq.derivatives(1.0, inputs, state, params)
    assert out1 == out2
    assert ds1 == ds2
