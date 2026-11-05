"""Ideal rotational friction — physical-rotational.element.friction (tier: ideal).

τ = Tc * tanh(sharpness * ω) + b * ω
"""

from __future__ import annotations

import math
from typing import Any


class Equations:
    """Ideal rotational friction: smooth Coulomb + viscous."""

    domain: str = "physical-rotational"
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
        Tc = float(params.get("coulomb", 1.0))
        b = float(params.get("viscous", 0.1))
        sharpness = float(params.get("sharpness", 100.0))
        tau = state.get("tau", 0.0)
        omega = state.get("omega", 0.0)
        return [tau - Tc * math.tanh(sharpness * omega) - b * omega]
