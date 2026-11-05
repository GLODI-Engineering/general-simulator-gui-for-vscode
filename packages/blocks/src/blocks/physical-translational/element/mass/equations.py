"""Translational mass equations (BE-38).

Constitutive law: F = m * dv/dt  (inertia element)

The through variable (force) depends on the time derivative of the across
variable (velocity); the DAE assembler in ``physical_network_lower`` handles
the dynamic contribution via the mass-matrix row for state ``v``.
"""

from __future__ import annotations

from typing import Any

BLOCK_TYPE = "physical-translational.element.mass"
DOMAIN = "physical-translational"


def through(across_pair: tuple[float, float], params: dict[str, Any]) -> float:
    """Constitutive law for a translational mass: F = m * dv/dt.

    Because the through variable depends on the *derivative* of the across
    variable, this function cannot be evaluated algebraically from a static
    across pair.  It returns 0 as a placeholder; the actual inertia term is
    assembled by the DAE lowering pass into the mass matrix.
    """
    return 0.0  # dynamic: assembled into M by lower_physical_network


class Equations:
    """Signal-flow protocol stub (state_vars cross-validated by TemplateRegistry)."""

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return ["v"]

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        # Physical-network blocks are assembled by the DAE lowering pass;
        # this stub satisfies the BlockEquations protocol.
        return {}, {}
