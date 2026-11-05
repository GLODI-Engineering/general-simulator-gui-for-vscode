"""Mux block equations: gather N input vectors into one output vector."""

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
    """Concatenate inputs in0, in1, … into a single output vector."""

    def compute(
        self,
        inputs: dict[str, Any],
        params: dict[str, Any],
    ) -> dict[str, Any]:
        n_inputs = int(params.get("n_inputs", 2))
        result: list[Any] = []
        for i in range(n_inputs):
            v = inputs.get(f"in{i}", [])
            result.extend(_to_flat_list(v))
        return {"out": result}
