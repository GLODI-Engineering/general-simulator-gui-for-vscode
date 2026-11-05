"""Behavioral mutual inductor — physical-electrical.passive.mutual_inductor (tier: behavioral).

Adds per-winding core-loss resistance (R_core) in parallel with each inductance.
Residuals remain smooth (no switching).
"""

from __future__ import annotations

import math
from typing import Any


class Equations:
    """Behavioral mutual inductor with core losses."""

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
        L1 = float(params.get("L1", 1.0e-6))
        L2 = float(params.get("L2", 1.0e-6))
        k = float(params.get("k", 0.99))
        R_core = float(params.get("R_core", 1.0e6))
        M = k * math.sqrt(L1 * L2)
        v1 = state.get("v1", 0.0)
        v2 = state.get("v2", 0.0)
        i1 = state.get("i1", 0.0)
        i2 = state.get("i2", 0.0)
        di1_dt = state.get("di1_dt", 0.0)
        di2_dt = state.get("di2_dt", 0.0)
        return [
            v1 - L1 * di1_dt - M * di2_dt - R_core * i1,
            v2 - M * di1_dt - L2 * di2_dt - R_core * i2,
        ]
