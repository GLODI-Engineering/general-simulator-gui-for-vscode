"""Ideal memristor — physical-electrical.passive.memristor (tier: ideal).

HP-type linear drift model:
    R(w) = R_on * w + R_off * (1 - w)   where w ∈ [0, 1] is normalised state
    dw/dt = mu_v * R_on / D**2 * i

Constitutive equation:
    v_pn - R(w) * i = 0

State variable: w (normalised doping-front position, 0-1).

Smooth: linear in w and i — trivially C¹.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Ideal HP memristor."""

    domain: str = "physical-electrical"
    tier: str = "ideal"

    MU_V: float = 1.0e-14  # m²/(V·s) — ion mobility

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return ["w"]

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
        R_on = float(params.get("R_on", 100.0))
        R_off = float(params.get("R_off", 16000.0))
        w = float(state.get("w", 0.5))
        v_pn = state.get("v_pn", 0.0)
        i = state.get("i", 0.0)
        R_w = R_on * w + R_off * (1.0 - w)
        return [v_pn - R_w * i]
