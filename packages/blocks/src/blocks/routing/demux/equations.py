"""Demux block equations: scatter one input vector into N output sub-vectors."""

from __future__ import annotations

from typing import Any


def _to_flat_list(v: Any) -> list[Any]:
    if isinstance(v, int | float):
        return [v]
    if isinstance(v, list):
        return v
    if hasattr(v, "tolist"):
        return v.tolist()  # type: ignore[no-any-return]
    return list(v)


class Equations:
    """Partition *in* according to *params.outputs* list of sizes."""

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        inp = _to_flat_list(inputs.get("in", []))
        outputs_spec: list[int] = [int(s) for s in params.get("outputs", [1, 1])]
        result: dict[str, Any] = {}
        offset = 0
        for i, size in enumerate(outputs_spec):
            result[f"out{i}"] = inp[offset : offset + size]
            offset += size
        return result
