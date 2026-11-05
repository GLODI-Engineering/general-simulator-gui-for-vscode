"""Rotational spring equations (BE-38).

Constitutive law: T = k * θ   where dθ/dt = ω_a - ω_b
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-rotational.element.spring"
DOMAIN = "physical-rotational"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Constitutive law: T = k * θ (treat across_pair[0] - across_pair[1] as angle)."""
    k = float(params.get("k", 1.0))
    theta = float(across_pair[0]) - float(across_pair[1])
    return k * theta


class Equations:
    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return ["theta"]

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return {}, {}
