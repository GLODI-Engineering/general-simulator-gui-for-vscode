"""Integrator block equations: dx/dt = u, output = clamp(x, lo, hi)."""

from __future__ import annotations

from typing import Any


class Equations:
    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return ["x"]

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        lo = float(params.get("lo", -1.0e30))
        hi = float(params.get("hi", 1.0e30))
        x = max(lo, min(hi, state.get("x", 0.0)))
        return {"out": x}, {"x": inputs.get("in", 0.0)}
