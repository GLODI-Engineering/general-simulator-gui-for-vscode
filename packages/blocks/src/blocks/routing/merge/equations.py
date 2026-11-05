"""Merge block equations: output = most-recently-active input."""

from __future__ import annotations

from typing import Any


class Equations:
    """Pass through the most-recently-active input.

    The active input index is passed via params["_active"] (set by the
    execution-gating layer in BE-32/BE-37).  When no explicit active index is
    available defaults to input 0.
    """

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        active: int = int(params.get("_active", 0))
        return {"out": inputs.get(f"in{active}", inputs.get("in0"))}
