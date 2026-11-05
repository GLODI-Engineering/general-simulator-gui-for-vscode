"""Thermal mass (capacitance) equations (BE-38).

Constitutive law: Q = C * dT/dt  (thermal capacitance element)
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-thermal.element.mass"
DOMAIN = "physical-thermal"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Constitutive law: Q = C * dT/dt (dynamic; returns 0 as placeholder)."""
    return 0.0


class Equations:
    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return ["T"]

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return {}, {}
