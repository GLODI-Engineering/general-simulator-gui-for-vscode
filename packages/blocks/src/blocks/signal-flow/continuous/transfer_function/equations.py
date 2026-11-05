"""Equations for signal-flow.continuous.transfer_function.

state_size = len(den) - 1  (dynamic)

Realised in controllable canonical (companion) state-space form via
scipy.signal.tf2ss.  The order equals the denominator polynomial length
minus one (spec §15.1).
"""

from __future__ import annotations

from typing import Any

import numpy as np

try:
    from scipy.signal import tf2ss  # type: ignore[import]

    _HAS_SCIPY = True
except ImportError:
    _HAS_SCIPY = False


class Equations:
    has_direct_feedthrough: bool = True  # D term present when len(num)==len(den)
    is_discrete: bool = False

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        den = list(params.get("den", [1.0, 1.0]))
        order = max(0, len(den) - 1)
        return [f"x{i}" for i in range(order)]

    def rhs(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float,
    ) -> dict[str, float]:
        num = list(params.get("num", [1.0]))
        den = list(params.get("den", [1.0, 1.0]))
        if not _HAS_SCIPY:
            return {f"x{i}": 0.0 for i in range(max(0, len(den) - 1))}
        try:
            a_mat, b_mat, _, _ = tf2ss(num, den)
        except Exception:
            return {f"x{i}": 0.0 for i in range(max(0, len(den) - 1))}
        order = a_mat.shape[0]
        state_names = [f"x{i}" for i in range(order)]
        x = np.array([state.get(name, 0.0) for name in state_names])
        u = np.array([[inputs.get("in", 0.0)]])
        dx = (a_mat @ x.reshape(-1, 1) + b_mat @ u).flatten()
        return {name: float(dx[i]) for i, name in enumerate(state_names)}

    def output(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float = 0.0,
    ) -> dict[str, float]:
        num = list(params.get("num", [1.0]))
        den = list(params.get("den", [1.0, 1.0]))
        if not _HAS_SCIPY:
            return {"out": 0.0}
        try:
            a_mat, _, c_mat, d_mat = tf2ss(num, den)
        except Exception:
            return {"out": 0.0}
        order = a_mat.shape[0]
        state_names = [f"x{i}" for i in range(order)]
        x = np.array([state.get(name, 0.0) for name in state_names])
        u = np.array([[inputs.get("in", 0.0)]])
        y = float((c_mat @ x.reshape(-1, 1) + d_mat @ u).flatten()[0])
        return {"out": y}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return (
            self.output(state, inputs, params, t),
            self.rhs(state, inputs, params, t),
        )
