"""Behavioral rotational friction — physical-rotational.element.friction (tier: behavioral).

Stribeck model: τ = (Tc + (Ts - Tc)*exp(-(ω/ωs)²)) * tanh(k*ω) + b*ω
"""

from __future__ import annotations

import math
from typing import Any


class Equations:
    """Behavioral rotational friction: Stribeck model."""

    domain: str = "physical-rotational"
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
        Tc = float(params.get("coulomb", 1.0))
        Ts = float(params.get("static", Tc * 1.5))
        omega_s = float(params.get("vs", 0.1))
        b = float(params.get("viscous", 0.1))
        sharpness = float(params.get("sharpness", 100.0))
        tau = state.get("tau", 0.0)
        omega = state.get("omega", 0.0)
        stribeck = Tc + (Ts - Tc) * math.exp(-((omega / max(omega_s, 1e-9)) ** 2))
        return [tau - stribeck * math.tanh(sharpness * omega) - b * omega]
