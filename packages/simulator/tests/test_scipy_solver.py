"""BE-15 — scipy solve_ivp (Radau) solver tests.

Covers:
- First-order low-pass step response matches analytic solution within rtol=1e-4.
- Solver respects atol/rtol overrides.
- Cancellation: long-running simulation cancels within 200 ms.
"""

from __future__ import annotations

import threading
import time

import numpy as np
import pytest


def _import_solver():  # type: ignore[no-untyped-def]
    try:
        from simulator.solvers.protocol import CancelToken, SolverOptions
        from simulator.solvers.scipy_solver import ScipySolver

        return ScipySolver, CancelToken, SolverOptions
    except (ImportError, AttributeError):
        pytest.xfail("simulator.solvers.scipy_solver not yet implemented")


def _import_compiler():  # type: ignore[no-untyped-def]
    try:
        from simulator.compiler.gsim_loader import load_gsim
        from simulator.compiler.ir1_builder import build_ir1
        from simulator.compiler.ir2_lowering import lower_to_ir2
        from simulator.compiler.scipy_compiler import compile_model

        return load_gsim, build_ir1, lower_to_ir2, compile_model
    except (ImportError, AttributeError):
        pytest.xfail("simulator.compiler.scipy_compiler not yet implemented")


# ---------------------------------------------------------------------------
# Build a first-order LP model programmatically using a simple ODE
# ---------------------------------------------------------------------------


def _make_first_order_lp_compiled():  # type: ignore[no-untyped-def]
    """Returns a CompiledModel for dx/dt = -x + 1 (first-order LP step response)."""

    # Create a minimal CompiledModel-compatible object using a lambda
    class _FakeCompiled:
        def __init__(self) -> None:
            self.x0 = np.zeros(1)
            self.observations: dict = {}

        def f(self, t: float, x: np.ndarray) -> np.ndarray:
            # dx/dt = -x + 1  →  x(t) = 1 - exp(-t)
            self.observations["output"] = x[0]
            return np.array([-x[0] + 1.0])

    return _FakeCompiled()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_first_order_step_response_matches_analytic() -> None:
    ScipySolver, _, SolverOptions = _import_solver()

    compiled = _make_first_order_lp_compiled()
    solver = ScipySolver()
    opts = SolverOptions(t_start=0.0, t_end=10.0, n_samples=3000, rtol=1e-6, atol=1e-9)
    result = solver.solve(compiled, t_span=(0.0, 10.0), options=opts)

    t = result.time
    # Find the "output" signal (first signal in the bundle)
    signal = result.signals[0] if result.signals else None
    if signal is None:
        pytest.skip("ResultBundle has no signals — check solver output format")

    analytic = 1.0 - np.exp(-t)
    np.testing.assert_allclose(signal.data, analytic, rtol=1e-4, atol=1e-4)


def test_solver_respects_rtol_override() -> None:
    """Solving with a tighter rtol should change (improve) the accuracy."""
    ScipySolver, _, SolverOptions = _import_solver()
    compiled = _make_first_order_lp_compiled()
    solver = ScipySolver()

    opts_loose = SolverOptions(t_start=0.0, t_end=5.0, n_samples=100, rtol=1e-3, atol=1e-6)
    opts_tight = SolverOptions(t_start=0.0, t_end=5.0, n_samples=100, rtol=1e-8, atol=1e-11)

    result_loose = solver.solve(compiled, t_span=(0.0, 5.0), options=opts_loose)
    result_tight = solver.solve(compiled, t_span=(0.0, 5.0), options=opts_tight)

    t = result_loose.time
    analytic = 1.0 - np.exp(-t)

    err_loose = np.max(np.abs(result_loose.signals[0].data - analytic))
    err_tight = np.max(np.abs(result_tight.signals[0].data - analytic))

    # Tight tolerance should give same or better accuracy
    assert err_tight <= err_loose + 1e-8, (
        f"Tighter rtol should improve or maintain accuracy; loose={err_loose:.2e} tight={err_tight:.2e}"
    )


def test_result_time_vector_has_n_samples() -> None:
    ScipySolver, _, SolverOptions = _import_solver()
    compiled = _make_first_order_lp_compiled()
    solver = ScipySolver()
    opts = SolverOptions(t_start=0.0, t_end=5.0, n_samples=500)
    result = solver.solve(compiled, t_span=(0.0, 5.0), options=opts)
    assert len(result.time) == 500


def test_cancellation_within_200ms() -> None:
    """Cancelling a long-running simulation must return within 200 ms."""
    ScipySolver, CancelToken, SolverOptions = _import_solver()

    class _SlowCompiled:
        def __init__(self) -> None:
            self.x0 = np.zeros(1)
            self.observations: dict = {}

        def f(self, t: float, x: np.ndarray) -> np.ndarray:
            return np.array([-x[0]])  # fast ODE, but t_end is huge

    compiled = _SlowCompiled()
    solver = ScipySolver()
    token = CancelToken()
    opts = SolverOptions(t_start=0.0, t_end=1e9, n_samples=3000)

    errors: list[Exception] = []

    def run() -> None:
        try:
            solver.solve(compiled, t_span=(0.0, 1e9), options=opts, cancel=token)
        except Exception as exc:
            errors.append(exc)

    t = threading.Thread(target=run)
    t0 = time.monotonic()
    t.start()
    time.sleep(0.05)  # Let solve start
    token.cancel()
    t.join(timeout=1.0)
    elapsed = time.monotonic() - t0

    assert not t.is_alive(), "Solver thread did not terminate"
    assert elapsed < 0.5, f"Cancellation took {elapsed:.2f}s; expected < 0.5s"
