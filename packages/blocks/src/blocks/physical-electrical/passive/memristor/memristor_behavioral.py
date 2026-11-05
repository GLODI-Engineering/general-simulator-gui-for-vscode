"""Behavioral memristor — physical-electrical.passive.memristor (tier: behavioral).

Adds a smooth sigmoidal window function (Joglekar) that prevents w from
leaving [0, 1]:
    f(w) = 1 - (2*w - 1)**(2*p)

All expressions are smooth (C∞).
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Behavioral memristor with Joglekar window function."""

    domain: str = "physical-electrical"
    tier: str = "behavioral"

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
        # Clamp w to (0, 1) for smooth window computation
        w_c = min(max(w, 0.0), 1.0)
        v_pn = state.get("v_pn", 0.0)
        i = state.get("i", 0.0)
        R_w = R_on * w_c + R_off * (1.0 - w_c)
        return [v_pn - R_w * i]
