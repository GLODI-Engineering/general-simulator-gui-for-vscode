"""Rotational inertia equations (BE-38).

Constitutive law: T = J * dω/dt  (inertia element)
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-rotational.element.inertia"
DOMAIN = "physical-rotational"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Constitutive law: T = J * dω/dt (dynamic; returns 0 as placeholder)."""
    return 0.0


class Equations:
    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return ["omega"]

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return {}, {}
