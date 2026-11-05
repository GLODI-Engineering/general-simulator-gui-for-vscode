"""Thermal heat-flow source equations (BE-38).

Constitutive law: Q = Q_const  (ideal heat-flow source)
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-thermal.source.heat_flow"
DOMAIN = "physical-thermal"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Constitutive law: source drives constant heat flow Q regardless of temperature."""
    return float(params.get("Q", 0.0))


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
