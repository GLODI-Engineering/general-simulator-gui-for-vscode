"""BE-07 — Workspace snapshot generator tests.

Covers:
- Pre-imports (np, scipy, plt, pd, sympy) are filtered out.
- Dunder names (__name__, __file__, etc.) are filtered out.
- A user-defined ndarray includes dtype, shape, and a non-trivial preview.
- Snapshot bytes are bounded (no full-array serialization).
"""

from __future__ import annotations

import pytest


def _import_snapshot():  # type: ignore[no-untyped-def]
    try:
        from kernel_sidecar.kernel.snapshot import workspace_snapshot

        return workspace_snapshot
    except (ImportError, AttributeError):
        pytest.xfail("kernel_sidecar.kernel.snapshot not yet implemented")


def _import_namespace():  # type: ignore[no-untyped-def]
    try:
        from kernel_sidecar.kernel.namespace import Namespace

        return Namespace
    except (ImportError, AttributeError):
        pytest.xfail("kernel_sidecar.kernel.namespace not yet implemented")


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------


def test_pre_imports_absent_from_snapshot() -> None:
    workspace_snapshot = _import_snapshot()
    Namespace = _import_namespace()
    ns = Namespace()
    entries = workspace_snapshot(ns.globals)
    names = {e["name"] for e in entries}
    for pre_import in ("np", "scipy", "plt", "pd", "sympy", "pi", "e"):
        assert pre_import not in names, f"Pre-import {pre_import!r} leaked into snapshot"


def test_dunder_names_absent_from_snapshot() -> None:
    workspace_snapshot = _import_snapshot()
    Namespace = _import_namespace()
    ns = Namespace()
    ns.exec("x = 1")  # ensure at least one user name is there
    entries = workspace_snapshot(ns.globals)
    names = {e["name"] for e in entries}
    for name in names:
        assert not name.startswith("__"), f"Dunder name {name!r} leaked into snapshot"


# ---------------------------------------------------------------------------
# Array entries
# ---------------------------------------------------------------------------


def test_array_entry_has_dtype_shape_preview() -> None:
    workspace_snapshot = _import_snapshot()
    Namespace = _import_namespace()
    ns = Namespace()
    ns.exec("import numpy as np; arr = np.linspace(0, 1, 100)")
    entries = workspace_snapshot(ns.globals)
    arr_entry = next((e for e in entries if e["name"] == "arr"), None)
    assert arr_entry is not None, "array 'arr' not in snapshot"
    assert arr_entry.get("type") == "ndarray"
    assert "dtype" in arr_entry
    assert "shape" in arr_entry
    assert "preview" in arr_entry


def test_array_preview_is_not_full_array() -> None:
    """Full arrays must NOT be serialised inline."""
    workspace_snapshot = _import_snapshot()
    Namespace = _import_namespace()
    ns = Namespace()
    # 1000-element array
    ns.exec("import numpy as np; big = np.ones(1000, dtype='float64')")
    entries = workspace_snapshot(ns.globals)
    big_entry = next((e for e in entries if e["name"] == "big"), None)
    assert big_entry is not None
    # The preview string must not contain 1000 elements written out
    preview = str(big_entry.get("preview", ""))
    # If all 1000 values were inline the string would be >> 5000 chars
    assert len(preview) < 500, "Array preview looks like full serialization"


def test_snapshot_bytes_bounded_for_large_array() -> None:
    """Snapshot of a large array must not grow proportionally with array size."""
    import json

    workspace_snapshot = _import_snapshot()
    Namespace = _import_namespace()
    ns = Namespace()
    ns.exec("import numpy as np; huge = np.random.rand(100_000)")
    entries = workspace_snapshot(ns.globals)
    serialized_size = len(json.dumps(entries))
    # 100k floats * ~20 chars each = ~2 MB if un-truncated; we expect < 10 KB
    assert serialized_size < 10_000, (
        f"Snapshot is {serialized_size} bytes for a 100k-element array — likely full serialization"
    )


# ---------------------------------------------------------------------------
# Scalar and string entries
# ---------------------------------------------------------------------------


def test_scalar_int_entry() -> None:
    workspace_snapshot = _import_snapshot()
    Namespace = _import_namespace()
    ns = Namespace()
    ns.exec("myint = 7")
    entries = workspace_snapshot(ns.globals)
    entry = next((e for e in entries if e["name"] == "myint"), None)
    assert entry is not None
    assert entry.get("value") == 7


def test_string_truncated_at_80_chars() -> None:
    workspace_snapshot = _import_snapshot()
    Namespace = _import_namespace()
    ns = Namespace()
    ns.exec("s = 'a' * 200")
    entries = workspace_snapshot(ns.globals)
    entry = next((e for e in entries if e["name"] == "s"), None)
    assert entry is not None
    # Either 'value' (short) or 'preview' (truncated) present
    text = entry.get("value", entry.get("preview", ""))
    assert len(text) <= 83  # 80 + "..."
