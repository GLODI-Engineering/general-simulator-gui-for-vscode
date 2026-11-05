"""Behavioral transformer — physical-electrical.passive.transformer (tier: behavioral).

Adds leakage inductance (L_lk) and winding resistance (R_w) per winding.
Smooth: no hard switching.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral transformer with leakage and copper losses."""

    domain: str = "physical-electrical"
    tier: str = "behavioral"

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return {}, {}

    def residuals(
        self,
        state: dict[str, float],
        params: dict[str, Any],
    ) -> list[float]:
        n = float(params.get("n", 1.0))
        R_w = float(params.get("R_w", 0.0))
        L_lk = float(params.get("L_lk", 0.0))
        v1 = state.get("v1", 0.0)
        v2 = state.get("v2", 0.0)
        i1 = state.get("i1", 0.0)
        i2 = state.get("i2", 0.0)
        di1_dt = state.get("di1_dt", 0.0)
        di2_dt = state.get("di2_dt", 0.0)
        return [
            v1 - n * v2 - R_w * i1 - L_lk * di1_dt,
            i2 - n * i1 + R_w * i2 / max(v2, 1e-9) + L_lk * di2_dt / max(v2, 1e-9),
        ]
