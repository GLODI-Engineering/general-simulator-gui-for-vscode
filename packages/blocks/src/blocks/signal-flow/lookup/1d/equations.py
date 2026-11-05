"""Equations for signal-flow.lookup.1d — 1-D lookup table (linear interpolation).

state_size = 0  (no state, direct feedthrough)
params.x: breakpoints vector
params.y: values vector
"""

from __future__ import annotations

from typing import Any

import numpy as np


class Equations:
    has_direct_feedthrough: bool = True
    is_discrete: bool = False

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def rhs(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float,
    ) -> dict[str, float]:
        return {}

    def output(
        self,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
        t: float = 0.0,
    ) -> dict[str, float]:
        xp = list(params.get("x", [0.0, 1.0]))
        yp = list(params.get("y", [0.0, 1.0]))
        u = inputs.get("in", 0.0)
        result = float(np.interp(u, xp, yp))
        return {"out": result}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
