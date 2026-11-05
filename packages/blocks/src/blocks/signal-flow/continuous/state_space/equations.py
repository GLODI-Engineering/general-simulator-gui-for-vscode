"""Equations for signal-flow.continuous.state_space — state-space system.

state_size = dynamic (number of rows in A)
  dx/dt = A*x + B*u
  y     = C*x + D*u
"""

from __future__ import annotations

from typing import Any

import numpy as np


class Equations:
    has_direct_feedthrough: bool = True  # D matrix may be non-zero
    is_discrete: bool = False

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        a_param = params.get("A", [[0.0]])
        a_list = list(a_param) if not isinstance(a_param, list) else a_param
        n = len(a_list)
        return [f"x{i}" for i in range(n)]

    def rhs(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float,
    ) -> dict[str, float]:
        a_mat = np.array(params.get("A", [[0.0]]), dtype=float)
        b_mat = np.array(params.get("B", [[1.0]]), dtype=float)
        n = a_mat.shape[0]
        state_names = [f"x{i}" for i in range(n)]
        x = np.array([state.get(name, 0.0) for name in state_names])
        u = np.array([[inputs.get("in", 0.0)]])
        if b_mat.ndim == 1:
            b_mat = b_mat.reshape(-1, 1)
        dx = (a_mat @ x.reshape(-1, 1) + b_mat @ u).flatten()
        return {name: float(dx[i]) for i, name in enumerate(state_names)}

    def output(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float = 0.0,
    ) -> dict[str, float]:
        a_mat = np.array(params.get("A", [[0.0]]), dtype=float)
        c_mat = np.array(params.get("C", [[1.0]]), dtype=float)
        d_mat = np.array(params.get("D", [[0.0]]), dtype=float)
        n = a_mat.shape[0]
        state_names = [f"x{i}" for i in range(n)]
        x = np.array([state.get(name, 0.0) for name in state_names])
        u = np.array([[inputs.get("in", 0.0)]])
        if c_mat.ndim == 1:
            c_mat = c_mat.reshape(1, -1)
        if d_mat.ndim == 1:
            d_mat = d_mat.reshape(1, -1)
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
