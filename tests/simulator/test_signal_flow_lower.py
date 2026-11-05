"""BE-37 (Mode A) — signal_flow_lower acceptance tests."""

from __future__ import annotations

import math

import pytest

from simulator.compiler.signal_flow_lower import AlgebraicLoopError, lower_signal_flow
from simulator.ir.ir1 import IR1Block, IR1Connection, IR1Graph


def _graph(blocks: list[IR1Block], connections: list[IR1Connection]) -> IR1Graph:
    return IR1Graph(blocks=blocks, connections=connections)


def test_lower_integrator() -> None:
    """Integrator with input=1 has dstate=1 and integrates linearly under scipy."""
    scipy = pytest.importorskip("scipy")
    solve_ivp = scipy.integrate.solve_ivp

    ir1 = _graph(
        blocks=[
            IR1Block("src", "signal-flow.source.constant", params={"value": 1.0}),
            IR1Block("int", "signal-flow.continuous.integrator"),
        ],
        connections=[IR1Connection(src=("src", "out"), dst=("int", "in"))],
    )

    sys = lower_signal_flow(ir1)

    assert len(sys.state_vars) == 1
    assert sys.state_vars[0] == ("int", "x")
    assert sys.rhs(0.0, [0.0]) == [1.0]

    sol = solve_ivp(sys.rhs, (0.0, 2.0), y0=sys.x0, t_eval=[0.0, 0.5, 1.0, 2.0])
    assert sol.success
    for t, x in zip(sol.t, sol.y[0], strict=True):
        assert x == pytest.approx(t, abs=1e-3)


def test_lower_pid_step() -> None:
    """PID (kp=1, ki=0, kd=0) tracks step amplitude for t > t_step."""
    scipy = pytest.importorskip("scipy")
    solve_ivp = scipy.integrate.solve_ivp

    step_amplitude = 3.0
    ir1 = _graph(
        blocks=[
            IR1Block(
                "step",
                "signal-flow.source.step",
                params={"before": 0.0, "after": step_amplitude, "t_step": 0.1},
            ),
            IR1Block(
                "pid",
                "signal-flow.continuous.pid",
                params={"kp": 1.0, "ki": 0.0, "kd": 0.0},
            ),
        ],
        connections=[IR1Connection(src=("step", "out"), dst=("pid", "in"))],
    )

    sys = lower_signal_flow(ir1)
    sol = solve_ivp(sys.rhs, (0.0, 0.2), y0=sys.x0, t_eval=[0.2])
    assert sol.success

    y = sys.output_map(0.2, sol.y[:, -1])
    assert y[("pid", "out")] == pytest.approx(step_amplitude, abs=1e-9)


def test_lower_transfer_function() -> None:
    """1/(s+1) lowers to 1-state system with exp decay response."""
    scipy = pytest.importorskip("scipy")
    solve_ivp = scipy.integrate.solve_ivp

    ir1 = _graph(
        blocks=[
            IR1Block("u0", "signal-flow.source.constant", params={"value": 0.0}),
            IR1Block(
                "tf",
                "signal-flow.continuous.transfer_function",
                params={"num": [1.0], "den": [1.0, 1.0], "ic": 1.0},
            ),
        ],
        connections=[IR1Connection(src=("u0", "out"), dst=("tf", "in"))],
    )

    sys = lower_signal_flow(ir1)
    assert len(sys.state_vars) == 1

    t_eval = [0.0, 0.25, 0.5, 1.0, 2.0]
    sol = solve_ivp(sys.rhs, (0.0, 2.0), y0=sys.x0, t_eval=t_eval)
    assert sol.success

    for t, x in zip(sol.t, sol.y[0], strict=True):
        assert x == pytest.approx(math.exp(-t), abs=2e-3)


def test_lower_algebraic_loop() -> None:
    """Gain ↔ Sum feedthrough cycle raises AlgebraicLoopError with block ids."""
    ir1 = _graph(
        blocks=[
            IR1Block("src", "signal-flow.source.constant", params={"value": 1.0}),
            IR1Block("gain", "signal-flow.math.gain", params={"k": 2.0}),
            IR1Block("sum", "signal-flow.math.sum", params={"signs": "++"}),
        ],
        connections=[
            IR1Connection(src=("src", "out"), dst=("sum", "in0")),
            IR1Connection(src=("sum", "out"), dst=("gain", "in")),
            IR1Connection(src=("gain", "out"), dst=("sum", "in1")),
        ],
    )

    with pytest.raises(AlgebraicLoopError) as exc_info:
        lower_signal_flow(ir1)

    msg = str(exc_info.value)
    assert "gain" in msg
    assert "sum" in msg


def test_lower_saturation() -> None:
    """Saturation(lo=-1, hi=1) clamps high and low inputs correctly."""
    # High clamp case.
    ir1_hi = _graph(
        blocks=[
            IR1Block("src", "signal-flow.source.constant", params={"value": 3.0}),
            IR1Block("sat", "signal-flow.discontinuity.saturation", params={"lo": -1.0, "hi": 1.0}),
        ],
        connections=[IR1Connection(src=("src", "out"), dst=("sat", "in"))],
    )
    sys_hi = lower_signal_flow(ir1_hi)
    y_hi = sys_hi.output_map(0.0, sys_hi.x0)
    assert y_hi[("sat", "out")] == pytest.approx(1.0)

    # Low clamp case.
    ir1_lo = _graph(
        blocks=[
            IR1Block("src", "signal-flow.source.constant", params={"value": -3.0}),
            IR1Block("sat", "signal-flow.discontinuity.saturation", params={"lo": -1.0, "hi": 1.0}),
        ],
        connections=[IR1Connection(src=("src", "out"), dst=("sat", "in"))],
    )
    sys_lo = lower_signal_flow(ir1_lo)
    y_lo = sys_lo.output_map(0.0, sys_lo.x0)
    assert y_lo[("sat", "out")] == pytest.approx(-1.0)


def test_lower_enabled_gating() -> None:
    """Enabled integrator freezes when enable=0, integrates when enable=1."""
    # Disabled: dx must be 0 even with input=1.
    ir1_disabled = _graph(
        blocks=[
            IR1Block("u", "signal-flow.source.constant", params={"value": 1.0}),
            IR1Block("en", "signal-flow.source.constant", params={"value": 0.0}),
            IR1Block(
                "int",
                "signal-flow.continuous.integrator",
                params={"ic": 2.0},
                execution_kind="enabled",
                enable_signal=("en", "out"),
            ),
        ],
        connections=[
            IR1Connection(src=("u", "out"), dst=("int", "in")),
            IR1Connection(src=("en", "out"), dst=("int", "enable")),
        ],
    )
    sys_disabled = lower_signal_flow(ir1_disabled)
    assert sys_disabled.rhs(0.0, [2.0]) == [0.0]

    # Enabled: same integrator must advance normally.
    ir1_enabled = _graph(
        blocks=[
            IR1Block("u", "signal-flow.source.constant", params={"value": 1.0}),
            IR1Block("en", "signal-flow.source.constant", params={"value": 1.0}),
            IR1Block(
                "int",
                "signal-flow.continuous.integrator",
                params={"ic": 2.0},
                execution_kind="enabled",
                enable_signal=("en", "out"),
            ),
        ],
        connections=[
            IR1Connection(src=("u", "out"), dst=("int", "in")),
            IR1Connection(src=("en", "out"), dst=("int", "enable")),
        ],
    )
    sys_enabled = lower_signal_flow(ir1_enabled)
    assert sys_enabled.rhs(0.0, [2.0]) == [1.0]


def test_lower_triggered_edge() -> None:
    """Triggered (rising) integrator advances only at rising trigger edges."""
    ir1 = _graph(
        blocks=[
            IR1Block("u", "signal-flow.source.constant", params={"value": 1.0}),
            IR1Block(
                "trig",
                "signal-flow.source.step",
                params={"before": 0.0, "after": 1.0, "t_step": 0.5},
            ),
            IR1Block(
                "int",
                "signal-flow.continuous.integrator",
                execution_kind="triggered",
                trigger_signal=("trig", "out"),
                trigger_kind="rising",
            ),
        ],
        connections=[
            IR1Connection(src=("u", "out"), dst=("int", "in")),
            IR1Connection(src=("trig", "out"), dst=("int", "trigger")),
        ],
    )

    sys = lower_signal_flow(ir1)

    # Before edge: no advance.
    assert sys.rhs(0.0, [0.0]) == [0.0]
    # First sample after step crossing: rising edge => advance.
    assert sys.rhs(0.6, [0.0]) == [1.0]
    # Still high but no new edge: frozen again.
    assert sys.rhs(0.7, [0.0]) == [0.0]
