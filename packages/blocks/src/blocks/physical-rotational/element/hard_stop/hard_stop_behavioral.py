"""Behavioral rotational hard stop — physical-rotational.element.hard_stop (tier: behavioral)."""

from __future__ import annotations

import math
from typing import Any


def _smooth_max(x: float, eps: float = 1.0e-4) -> float:
    return (x + math.sqrt(x**2 + eps**2)) * 0.5


class Equations:
    """Behavioral rotational hard stop: cubic contact stiffness."""

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
        lo = float(params.get("lo", -math.pi / 2))
        hi = float(params.get("hi", math.pi / 2))
        k = float(params.get("stiffness", 1.0e4))
        b = float(params.get("damping", 10.0))
        theta = state.get("theta", 0.0)
        omega = state.get("omega", 0.0)
        tau = state.get("tau", 0.0)
        pen_lo = _smooth_max(lo - theta)
        pen_hi = _smooth_max(theta - hi)
        tau_lo = k * pen_lo + k * pen_lo**2 * 0.1 + b * _smooth_max(-omega)
        tau_hi = -(k * pen_hi + k * pen_hi**2 * 0.1 + b * _smooth_max(omega))
        return [tau - tau_lo - tau_hi]
