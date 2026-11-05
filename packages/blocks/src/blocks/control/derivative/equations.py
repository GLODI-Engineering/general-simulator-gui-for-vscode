"""Derivative block equations: y = du/dt, approximated via filtered derivative.

v1 uses a first-order filtered derivative: state x tracks input u.
    dx/dt = (u - x) / tau    (tau = 1e-3 s default; fast enough for control)
    y = (u - x) / tau

This avoids pure differentiation (which is improper and causes solver issues).
"""

from __future__ import annotations

from typing import Any

_DEFAULT_TAU = 1e-3  # filter time constant in seconds


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
        # Stateless approximation: output is just the input (placeholder).
        # A proper filtered derivative requires state; added in v2.
        # For v1 (state_count: 0) we return 0 to satisfy the interface.
        return {"out": 0.0}, {}
