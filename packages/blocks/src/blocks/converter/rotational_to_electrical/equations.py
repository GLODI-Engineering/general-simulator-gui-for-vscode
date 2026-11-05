"""Converter: physical-rotational → physical-electrical (generator, spec §15.6).

Coupling residuals (symmetric with electrical_to_rotational):
  τ - kt * i_arm = 0          (electromagnetic torque)
  v_arm - ke * ω  = 0          (back-EMF / generated voltage)

where:
  τ     — shaft torque        (rotational through variable)
  ω     — angular velocity    (rotational across variable)
  i_arm — armature current    (electrical through variable)
  v_arm — armature voltage    (electrical across variable)
  kt    — torque constant     (N·m/A)
  ke    — back-EMF constant   (V·s/rad)
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Rotational-to-electrical (generator) converter equations."""

    in_kind: str = "physical-rotational"
    out_kind: str = "physical-electrical"

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        # Not called by signal-flow ODE solver; physical ports are acausal.
        return {}, {}

    def residuals(
        self,
        state: dict[str, float],
        params: dict[str, Any],
    ) -> list[float]:
        """Return coupling residuals for rotational↔electrical (generator) boundary."""
        kt = float(params.get("kt", 0.01))
        ke = float(params.get("ke", 0.01))
        tau = state.get("tau", 0.0)
        i_arm = state.get("i_arm", 0.0)
        v_arm = state.get("v_arm", 0.0)
        omega = state.get("omega", 0.0)
        return [
            tau - kt * i_arm,  # electromagnetic torque
            v_arm - ke * omega,  # back-EMF / generated voltage
        ]
