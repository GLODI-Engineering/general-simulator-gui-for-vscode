"""ScipySolver — scipy solve_ivp wrapper (BE-15)."""

from __future__ import annotations

import uuid
from typing import Any, ClassVar

import numpy as np
from scipy.integrate import solve_ivp

from simulator.compiler.codegen_state import CompiledModel
from simulator.solvers.protocol import (
    CancelToken,
    ProgressCallback,
    ResultBundle,
    Signal,
    SolverOptions,
)


class ScipySolver:
    name = "scipy.radau"
    capabilities: ClassVar[set[str]] = {"transient"}

    def can_handle(self, ir2: Any, intent: str) -> bool:
        return not getattr(ir2, "has_circuit_elements", False)

    def solve(
        self,
        compiled: CompiledModel,
        t_span: tuple[float, float],
        options: SolverOptions,
        progress: ProgressCallback | None = None,
        cancel: CancelToken | None = None,
    ) -> ResultBundle:
        t_start, t_end = t_span
        t_eval = np.linspace(t_start, t_end, options.n_samples)

        # Clear any previous observation hook data.
        for hook in getattr(compiled, "observation_hooks", []) or []:
            hook.values.clear()
            hook.times.clear()

        # Progress reporting: roughly 100 callbacks across the time span.
        progress_step = (t_end - t_start) / 100.0
        last_progress_t = [t_start]

        def f_wrapped(t: float, x: np.ndarray) -> np.ndarray:
            if cancel is not None and cancel.is_cancelled:
                raise InterruptedError("Simulation cancelled.")
            if progress is not None and t - last_progress_t[0] >= progress_step:
                frac = min(1.0, (t - t_start) / max(t_end - t_start, 1e-12))
                progress(frac)
                last_progress_t[0] = t
            return compiled.f(t, x)

        # Limit max step so the cancel token is checked at least every
        # (t_end-t_start)/1000 of simulation time, giving responsive cancellation.
        cancel_max_step = (t_end - t_start) / 1000.0

        result = solve_ivp(
            f_wrapped,
            t_span=(t_start, t_end),
            y0=compiled.x0,
            method=options.method,
            rtol=options.rtol,
            atol=options.atol,
            dense_output=True,
            t_eval=t_eval,
            max_step=cancel_max_step,
        )

        if not result.success:
            raise RuntimeError(f"Solver failed: {result.message}")

        if progress is not None:
            progress(1.0)

        # Build signal list from observation hooks (if present on compiled).
        signals: list[Signal] = []
        signals_dict: dict[tuple[str, str], np.ndarray] = {}
        signal_names_dict: dict[tuple[str, str], str] = {}

        observation_hooks = getattr(compiled, "observation_hooks", None) or []
        signal_names_map = getattr(compiled, "signal_names", {})

        for hook in observation_hooks:
            key = (hook.block_id, hook.port_id)
            if hook.values:
                hook_t = np.array(hook.times, dtype=float)
                hook_v = np.array(hook.values, dtype=float)
                interp = np.interp(t_eval, hook_t, hook_v).astype(np.float32)
            else:
                interp = np.zeros(len(t_eval), dtype=np.float32)
            name = signal_names_map.get(key, f"{hook.block_id}.{hook.port_id}")
            signals.append(
                Signal(block_id=hook.block_id, port_id=hook.port_id, name=name, data=interp)
            )
            signals_dict[key] = interp
            signal_names_dict[key] = name

        # Fall back: if no observation hooks, expose the state trajectory
        # (or a zero signal if no states).
        if not signals:
            if result.y.shape[0] > 0:
                for i in range(result.y.shape[0]):
                    data = result.y[i].astype(np.float32)
                    key = ("state", str(i))
                    signals.append(
                        Signal(block_id="state", port_id=str(i), name=f"x[{i}]", data=data)
                    )
                    signals_dict[key] = data
                    signal_names_dict[key] = f"x[{i}]"
            else:
                # No states — return a zero-length dummy signal.
                data = np.zeros(len(t_eval), dtype=np.float32)
                key = ("state", "0")
                signals.append(Signal(block_id="state", port_id="0", name="x[0]", data=data))
                signals_dict[key] = data
                signal_names_dict[key] = "x[0]"

        sim_id = str(uuid.uuid4())
        return ResultBundle(
            sim_id=sim_id,
            t=t_eval,
            signals=signals,
            _signals_dict=signals_dict,
            _signal_names=signal_names_dict,
            t_start=t_start,
            t_end=t_end,
            n_points=len(t_eval),
        )


# Module-level singleton registered for auto_select.
SCIPY_BACKEND = ScipySolver()
