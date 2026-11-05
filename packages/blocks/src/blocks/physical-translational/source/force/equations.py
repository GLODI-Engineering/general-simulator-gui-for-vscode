"""Translational force source equations (BE-38).

Constitutive law: F = F_const  (ideal force source — drives constant force)
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-translational.source.force"
DOMAIN = "physical-translational"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Constitutive law: the source drives a constant force F regardless of velocity."""
    return float(params.get("F", 0.0))


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
