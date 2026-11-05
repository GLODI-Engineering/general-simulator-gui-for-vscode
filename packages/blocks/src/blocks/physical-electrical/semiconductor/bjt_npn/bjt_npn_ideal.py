"""Ideal NPN BJT — physical-electrical.semiconductor.bjt_npn (tier: ideal).

Simplified Ebers-Moll (active region only), smooth:
    I_C = beta_F * I_B   (smooth: linear)

Residuals (KCL at B, C, E nodes):
    i_b - I_B = 0
    i_c - beta_F * I_B = 0
    i_e + i_b + i_c = 0  (KCL)
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal NPN BJT: I_C = β · I_B."""

    domain: str = "physical-electrical"
    tier: str = "ideal"

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
        beta_F = float(params.get("beta_F", 100.0))
        i_b = state.get("i_b", 0.0)
        i_c = state.get("i_c", 0.0)
        i_e = state.get("i_e", 0.0)
        return [
            i_c - beta_F * i_b,
            i_e + i_b + i_c,
        ]
