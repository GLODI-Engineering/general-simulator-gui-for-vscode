"""Switch block equations: threshold-based two-way select."""

from __future__ import annotations

from typing import Any


def _scalar(v: Any) -> float:
    if isinstance(v, int | float):
        return float(v)
    if isinstance(v, list | tuple):
        return float(v[0])
    if hasattr(v, "__float__"):
        return float(v)
    return float(v)


def _meets_criteria(control: float, threshold: float, criteria: str) -> bool:
    if criteria == ">=":
        return control >= threshold
    if criteria == ">":
        return control > threshold
    if criteria == "~=":
        return abs(control - threshold) < 1e-9
    # fallback: treat unknown criteria as ">="
    return control >= threshold


class Equations:
    """Select in1 when criteria(control, threshold) is True, else in0.

    Input ports:
        in0       — output when criteria is False.
        in1       — output when criteria is True.
        control   — the comparison signal (scalar).

    params.threshold  — comparison threshold (default 0).
    params.criteria   — one of '>=', '>', '~=' (default '>=').
    """

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        threshold: float = float(params.get("threshold", 0.0))
        criteria: str = str(params.get("criteria", ">="))
        control: float = _scalar(inputs.get("control", inputs.get("in1", 0.0)))
        if _meets_criteria(control, threshold, criteria):
            return {"out": inputs.get("in1")}
        return {"out": inputs.get("in0")}
