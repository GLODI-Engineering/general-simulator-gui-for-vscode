"""Saturation block equations: y = clamp(u, lo, hi).

v1 note: hard clamp introduces discontinuity. The architectural invariant
(smooth models only) applies to IR-1→IR-2 lowering; saturation's clamp is
accepted as a piece-wise-smooth model in the control subset for v1.
"""

from __future__ import annotations

from typing import Any


class Equations:
    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        lo = float(params.get("lo", -1.0))
        hi = float(params.get("hi", 1.0))
        y = max(lo, min(hi, inputs.get("in", 0.0)))
        return {"out": y}, {}
