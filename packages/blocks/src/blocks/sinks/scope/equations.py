"""Scope sink block equations.

The scope captures input signals for the waveform viewer. In the simulation
pipeline, scope blocks are observation hooks — they record values but produce
no outputs and have no state.
"""

from __future__ import annotations

from typing import Any


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
        # Sink: no outputs, no state derivatives.
        # The compiler's observation hook records inputs["in"] separately.
        return {}, {}
