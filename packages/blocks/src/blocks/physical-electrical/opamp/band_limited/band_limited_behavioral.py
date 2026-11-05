"""Behavioral band-limited op-amp — physical-electrical.opamp.band_limited (tier: behavioral).

Single-pole model: gain rolls off at GBP/Av. Input/output resistances included.
Smooth: linear model — C¹.
"""

from __future__ import annotations

import math
from typing import Any


class Equations:
    """Behavioral band-limited op-amp: single-pole with R_in, R_out."""

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
        gbp = float(params.get("gbp", 1.0e6))  # Hz
        Av0 = float(params.get("Av0", 1.0e5))
        rin = float(params.get("rin", 1.0e6))
        rout = float(params.get("rout", 75.0))
        omega_0 = 2.0 * math.pi * gbp / Av0  # rad/s
        v_p = state.get("v_p", 0.0)
        v_n = state.get("v_n", 0.0)
        v_out = state.get("v_out", 0.0)
        i_out = state.get("i_out", 0.0)
        i_p = state.get("i_p", 0.0)
        i_n = state.get("i_n", 0.0)
        v_diff = v_p - v_n
        v_internal = Av0 * v_diff / (1.0 + Av0 / (omega_0 * max(omega_0, 1e-12)))
        return [
            v_out - v_internal + rout * i_out,
            i_p - v_diff / rin,
            i_n + v_diff / rin,
        ]
