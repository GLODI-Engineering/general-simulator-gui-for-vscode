"""Translational spring equations (BE-38).

Constitutive law: F = k * x   where dx/dt = v_a - v_b

The spring stores potential energy.  The through variable (force) equals the
spring stiffness times the integrated relative velocity (displacement *x*).
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-translational.element.spring"
DOMAIN = "physical-translational"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Constitutive law: F = k * x.

    *across_pair* is ``(v_a, v_b)`` (velocities at ports a and b).
    For a spring, the force depends on the *integral* of the velocity
    difference; this function returns the static spring force given that
    *across_pair[0]* is treated as the current displacement *x* directly.
    If the caller passes the actual displacement as the first element, the
    result is correct.
    """
    k = float(params.get("k", 1.0))
    x = float(across_pair[0]) - float(across_pair[1])
    return k * x


class Equations:
    """Signal-flow protocol stub."""

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return ["x"]

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        return {}, {}
