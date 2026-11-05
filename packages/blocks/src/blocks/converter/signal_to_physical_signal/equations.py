"""Converter: signal → physical-signal (passthrough with optional unit tag).

No extra residual is introduced.  The output value is simply the input
value scaled by *gain* (default 1.0).  The two paradigm systems share a
single variable — no coupling equation is needed.
"""

from __future__ import annotations

from typing import Any


class Equations:
    """Signal to physical-signal passthrough converter."""

    in_kind: str = "signal"
    out_kind: str = "physical-signal"

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        return []

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        gain = float(params.get("gain", 1.0))
        return {"out": gain * inputs.get("in", 0.0)}, {}

    def residuals(
        self,
        state: dict[str, float],
        params: dict[str, Any],
    ) -> list[float]:
        """No coupling residual — the variable is shared between systems."""
        return []
