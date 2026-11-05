"""Selector block equations: output[i] = input[params.indices[i]]."""

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
    """Gather indexed elements from the input vector."""

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        inp = _to_flat_list(inputs.get("in", []))
        indices: list[int] = [int(i) for i in params.get("indices", [])]
        return {"out": [inp[i] for i in indices]}
