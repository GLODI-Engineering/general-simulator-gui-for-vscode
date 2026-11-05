"""gsim_sch_writer — canonical-key-order JSON writer for .gsim_sch v2 (BE-30).

Public API
----------
write(doc) → str
    Accepts a :class:`~simulator.compiler.gsim_sch_loader.ModelDocument` and
    returns a UTF-8 JSON string with 2-space indentation, LF line endings, and
    keys in the canonical order specified by §17.4 of the .gsim_sch spec.

    The output ends with a single trailing newline (``\\n``).

Roundtrip guarantee
-------------------
For any *text* that was already emitted by this writer (i.e. it uses canonical
key ordering at every nesting level), ``write(load(text)) == text`` holds
byte-exactly.
"""

from __future__ import annotations

import json
from typing import Any

from simulator.compiler.gsim_sch_loader import ModelDocument

# ---------------------------------------------------------------------------
# Canonical key orders (§17.4)
# ---------------------------------------------------------------------------

_TOP_ORDER: list[str] = ["schema_version", "model"]

_MODEL_ORDER: list[str] = [
    "id",
    "name",
    # Optional (§4.1); emitted only when the loaded document carried it, so the
    # "schematic" default is never materialised into a pre-role file.
    "role",
    "grid",
    "params",
    "blocks",
    "wires",
    "lines",
    "nets",
    "simulation",
    "metadata",
]

_BLOCK_ORDER: list[str] = [
    "id",
    "type",
    "paradigm",
    "domain",
    "fidelity",
    "position",
    "rotation",
    "mirror",
    "params",
    "ic",
    "label",
    "subsystem",
]

_WIRE_ORDER: list[str] = ["id", "from", "to", "waypoints", "pinned", "net", "kind", "label"]

_PARAM_ENTRY_ORDER: list[str] = ["name", "value", "unit", "doc"]

_NET_ORDER: list[str] = ["name", "kind", "scope", "is_reference"]


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def write(doc: ModelDocument) -> str:
    """Serialise *doc* to a canonical .gsim_sch v2 JSON string.

    Keys at every object level are emitted in the order specified by §17.4.
    Block ``params`` and ``ic`` dicts use lexicographic key order.
    Any key not listed in the canonical order is appended after the canonical
    keys, sorted lexicographically.

    The returned string uses 2-space indentation, LF line endings, and ends
    with a trailing ``\\n``.
    """
    top: dict[str, Any] = _apply_order(
        {"schema_version": doc.schema_version, "model": doc.model},
        _TOP_ORDER,
    )
    top["model"] = _order_model(doc.model)
    return json.dumps(top, indent=2, ensure_ascii=False) + "\n"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _apply_order(d: dict[str, Any], order: list[str]) -> dict[str, Any]:
    """Return *d* with keys in *order* first, then remaining keys sorted."""
    out: dict[str, Any] = {}
    for key in order:
        if key in d:
            out[key] = d[key]
    for key in sorted(d.keys()):
        if key not in out:
            out[key] = d[key]
    return out


def _order_model(model: dict[str, Any]) -> dict[str, Any]:
    out = _apply_order(model, _MODEL_ORDER)
    if "params" in out and isinstance(out["params"], list):
        out["params"] = [_apply_order(p, _PARAM_ENTRY_ORDER) for p in out["params"]]
    if "blocks" in out and isinstance(out["blocks"], list):
        out["blocks"] = [_order_block(b) for b in out["blocks"]]
    if "wires" in out and isinstance(out["wires"], list):
        out["wires"] = [_apply_order(w, _WIRE_ORDER) for w in out["wires"]]
    if "nets" in out and isinstance(out["nets"], list):
        out["nets"] = [_apply_order(n, _NET_ORDER) for n in out["nets"]]
    return out


def _order_block(block: dict[str, Any]) -> dict[str, Any]:
    out = _apply_order(block, _BLOCK_ORDER)
    # §17.4: block params and ic use lexicographic key order
    if "params" in out and isinstance(out["params"], dict):
        out["params"] = dict(sorted(out["params"].items()))
    if "ic" in out and isinstance(out["ic"], dict):
        out["ic"] = dict(sorted(out["ic"].items()))
    # Subsystem is a nested model object
    if out.get("subsystem") and isinstance(out["subsystem"], dict):
        out["subsystem"] = _order_model(out["subsystem"])
    return out
