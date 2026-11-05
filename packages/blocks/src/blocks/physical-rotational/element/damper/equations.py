"""Rotational damper equations (BE-38).

Constitutive law: T = c * (ω_a - ω_b)
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-rotational.element.damper"
DOMAIN = "physical-rotational"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Constitutive law: T = c * (ω_a - ω_b)."""
    c = float(params.get("c", 1.0))
    return c * (float(across_pair[0]) - float(across_pair[1]))


class Equations:
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
