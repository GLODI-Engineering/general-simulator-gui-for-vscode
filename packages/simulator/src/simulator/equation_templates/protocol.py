"""BlockEquations protocol definition (BE-10)."""

from __future__ import annotations

from typing import Any, Protocol


class BlockEquations(Protocol):
    """Protocol that every equations.py must implement."""

    def state_vars(self, params: dict[str, Any]) -> list[str]:
        """Return state variable names for this block instance.

        For most blocks this is a fixed list (e.g. ['x'] for integrator).
        Dynamic blocks (transfer_function) compute it from params.
        """
        ...

    def derivatives(
        self,
        t: float,
        inputs: dict[str, float],
        state: dict[str, float],
        params: dict[str, Any],
    ) -> tuple[dict[str, float], dict[str, float]]:
        """Compute outputs and state derivatives at one solver step.

        Returns:
            (outputs, dstate_dt) — both keyed by port/state-var name.
        """
        ...
