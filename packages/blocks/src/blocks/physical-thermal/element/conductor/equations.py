"""Thermal conductor equations (BE-38).

Constitutive law: Q = G * (T_a - T_b)
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-thermal.element.conductor"
DOMAIN = "physical-thermal"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Constitutive law: Q = G * (T_a - T_b)."""
    g = float(params.get("G", 1.0))
    return g * (float(across_pair[0]) - float(across_pair[1]))


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
