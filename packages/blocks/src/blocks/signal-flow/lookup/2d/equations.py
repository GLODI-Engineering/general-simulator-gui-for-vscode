"""Equations for signal-flow.lookup.2d — 2-D lookup table (bilinear interpolation).

state_size = 0  (no state, direct feedthrough)
params.x:     row breakpoints
params.y:     column breakpoints
params.table: 2-D value matrix (rows index x, columns index y)
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
        xp = np.array(params.get("x", [0.0, 1.0]), dtype=float)
        yp = np.array(params.get("y", [0.0, 1.0]), dtype=float)
        table = np.array(params.get("table", [[0.0, 1.0], [1.0, 2.0]]), dtype=float)
        xi = inputs.get("in0", 0.0)
        yi = inputs.get("in1", 0.0)

        # Bilinear interpolation via scipy.interpolate.RegularGridInterpolator
        # or manual: find surrounding indices and interpolate.
        xi_clipped = float(np.clip(xi, xp[0], xp[-1]))
        yi_clipped = float(np.clip(yi, yp[0], yp[-1]))

        # Find bounding indices
        ix = int(np.searchsorted(xp, xi_clipped, side="right") - 1)
        iy = int(np.searchsorted(yp, yi_clipped, side="right") - 1)
        ix = int(np.clip(ix, 0, len(xp) - 2))
        iy = int(np.clip(iy, 0, len(yp) - 2))

        x0, x1 = xp[ix], xp[ix + 1]
        y0, y1 = yp[iy], yp[iy + 1]
        dx = (xi_clipped - x0) / (x1 - x0) if x1 != x0 else 0.0
        dy = (yi_clipped - y0) / (y1 - y0) if y1 != y0 else 0.0

        z00 = table[ix, iy]
        z10 = table[ix + 1, iy]
        z01 = table[ix, iy + 1]
        z11 = table[ix + 1, iy + 1]
        result = (
            z00 * (1 - dx) * (1 - dy) + z10 * dx * (1 - dy) + z01 * (1 - dx) * dy + z11 * dx * dy
        )
        return {"out": float(result)}

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return self.output(state, inputs, params, t), {}
