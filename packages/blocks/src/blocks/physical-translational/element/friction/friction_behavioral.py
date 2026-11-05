"""Behavioral translational friction — physical-translational.element.friction (tier: behavioral).

Stribeck friction model:
    F = (Fc + (Fs - Fc) * exp(-(v/vs)^2)) * tanh(sharpness * v) + b * v

Smooth: C¹ everywhere (no hard switching).
"""

from __future__ import annotations

import math
from typing import Any


class Equations:
    """Behavioral friction: Stribeck (smooth stiction)."""

    domain: str = "physical-translational"
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
        Fc = float(params.get("coulomb", 1.0))
        Fs = float(params.get("static", Fc * 1.5))
        vs = float(params.get("vs", 0.01))
        b = float(params.get("viscous", 0.1))
        sharpness = float(params.get("sharpness", 100.0))
        F = state.get("F", 0.0)
        v = state.get("v", 0.0)
        stribeck = Fc + (Fs - Fc) * math.exp(-((v / max(vs, 1e-9)) ** 2))
        F_friction = stribeck * math.tanh(sharpness * v) + b * v
        return [F - F_friction]
