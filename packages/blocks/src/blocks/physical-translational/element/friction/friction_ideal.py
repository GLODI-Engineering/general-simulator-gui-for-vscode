"""Ideal translational friction — physical-translational.element.friction (tier: ideal).

Smooth Coulomb + viscous friction using tanh:
    F = Fc * tanh(sharpness * v) + b * v

Smooth: C¹ everywhere.
"""

from __future__ import annotations

import math
from typing import Any


class Equations:
    """Ideal friction: smooth Coulomb (tanh) + viscous."""

    domain: str = "physical-translational"
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
        Fc = float(params.get("coulomb", 1.0))
        b = float(params.get("viscous", 0.1))
        sharpness = float(params.get("sharpness", 100.0))
        F = state.get("F", 0.0)
        v = state.get("v", 0.0)
        F_friction = Fc * math.tanh(sharpness * v) + b * v
        return [F - F_friction]
