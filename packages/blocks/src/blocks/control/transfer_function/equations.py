"""Transfer function block equations: H(s) = num(s) / den(s), realised as state-space.

State vector length equals len(den) - 1 (order of the denominator polynomial).
Uses scipy.signal.tf2ss for the observable canonical form.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy.signal import tf2ss


class Equations:
    def state_vars(self, params: dict[str, Any]) -> list[str]:
        den = list(params.get("den", [1.0, 1.0]))
        order = max(0, len(den) - 1)
        return [f"x{i}" for i in range(order)]

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        num = list(params.get("num", [1.0]))
        den = list(params.get("den", [1.0, 1.0]))

        try:
            A, B, C, D = tf2ss(num, den)  # noqa: N806
        except Exception:
            return {"out": 0.0}, {f"x{i}": 0.0 for i in range(max(0, len(den) - 1))}

        order = A.shape[0]
        state_names = [f"x{i}" for i in range(order)]
        x = np.array([state.get(name, 0.0) for name in state_names])
        u = np.array([[inputs.get("in", 0.0)]])

        dx = (A @ x.reshape(-1, 1) + B @ u).flatten()
        y = float((C @ x.reshape(-1, 1) + D @ u).flatten()[0])

        dstate = {name: float(dx[i]) for i, name in enumerate(state_names)}
        return {"out": y}, dstate
