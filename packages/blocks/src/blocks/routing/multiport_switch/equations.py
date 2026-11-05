"""MultiportSwitch block equations: output = inputs[clamp(int(control), 0, N-1)]."""

from __future__ import annotations

from typing import Any


class Equations:
    """Select one of N data inputs using a clamped integer control signal.

    Input ports:
        control  — the selector signal (converted to int and clamped).
        in0 … in(N-1) — data inputs.

    params.n_inputs — number of data inputs (default 2).
    """

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        n_inputs: int = int(params.get("n_inputs", 2))
        control_raw = inputs.get("control", 0)
        if isinstance(control_raw, list | tuple):
            control_raw = control_raw[0]
        idx = max(0, min(int(control_raw), n_inputs - 1))
        return {"out": inputs.get(f"in{idx}", inputs.get("in0"))}
