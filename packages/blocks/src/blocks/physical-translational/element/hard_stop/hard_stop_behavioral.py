"""Behavioral hard stop — physical-translational.element.hard_stop (tier: behavioral).

Same model as ideal but with higher-order smooth penetration law (cubic).
"""

from __future__ import annotations

import math
from typing import Any


def _smooth_max(x: float, eps: float = 1.0e-4) -> float:
    return (x + math.sqrt(x**2 + eps**2)) * 0.5


class Equations:
    """Behavioral hard stop: cubic contact stiffness."""

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
        lo = float(params.get("lo", -0.1))
        hi = float(params.get("hi", 0.1))
        k = float(params.get("stiffness", 1.0e5))
        b = float(params.get("damping", 100.0))
        x = state.get("x", 0.0)
        v = state.get("v", 0.0)
        F = state.get("F", 0.0)
        pen_lo = _smooth_max(lo - x)
        pen_hi = _smooth_max(x - hi)
        F_lo = k * pen_lo + k * pen_lo**2 * 0.1 + b * _smooth_max(-v)
        F_hi = -(k * pen_hi + k * pen_hi**2 * 0.1 + b * _smooth_max(v))
        return [F - F_lo - F_hi]
