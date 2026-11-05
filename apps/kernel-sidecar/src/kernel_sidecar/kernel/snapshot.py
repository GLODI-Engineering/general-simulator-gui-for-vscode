"""Workspace snapshot generator (BE-07).

After every execute, emit a workspace_update listing all user bindings.
Pre-imports and dunder names are filtered out. Arrays are previewed only.
"""

from __future__ import annotations

import types
from typing import Any

import numpy as np

from kernel_sidecar.kernel.namespace import PRE_IMPORT_NAMES


def _format_array_preview(arr: np.ndarray) -> str:
    flat = arr.flat
    items = [str(x) for x, _ in zip(flat, range(5), strict=False)]
    if arr.size > 5:
        items.append("...")
    return "[" + ", ".join(items) + "]"


def snapshot_entry(name: str, value: Any) -> dict[str, Any]:
    if isinstance(value, np.ndarray):
        return {
            "name": name,
            "type": "ndarray",
            "dtype": str(value.dtype),
            "shape": list(value.shape),
            "preview": _format_array_preview(value),
        }
    if isinstance(value, int | float | complex):
        return {"name": name, "type": type(value).__name__, "value": value}
    if isinstance(value, str):
        if len(value) <= 80:
            return {"name": name, "type": "str", "value": value}
        return {"name": name, "type": "str", "preview": value[:77] + "..."}
    return {"name": name, "type": type(value).__name__, "preview": repr(value)[:80]}


def _is_pre_import(name: str, value: Any) -> bool:
    if name in PRE_IMPORT_NAMES:
        return True
    if name.startswith("__"):
        return True
    return bool(isinstance(value, types.ModuleType))


def build_snapshot(globals_dict: dict[str, Any]) -> list[dict[str, Any]]:
    """Return workspace entries for all user-defined names."""
    entries: list[dict[str, Any]] = []
    for name, value in globals_dict.items():
        if _is_pre_import(name, value):
            continue
        try:
            entries.append(snapshot_entry(name, value))
        except Exception:
            entries.append({"name": name, "type": "unknown", "preview": "<error>"})
    return entries


workspace_snapshot = build_snapshot
