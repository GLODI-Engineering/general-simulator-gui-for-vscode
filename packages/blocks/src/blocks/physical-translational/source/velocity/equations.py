"""Translational velocity source equations (BE-38).

Constitutive law: v_a - v_b = v_const  (ideal velocity source — pins across)
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-translational.source.velocity"
DOMAIN = "physical-translational"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Across source: drives a constant velocity; through (force) is a reaction.

    Returns 0 as a placeholder; the reaction force is determined by the network
    equations and is not expressible as a simple function of across alone.
    """
    return 0.0


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
