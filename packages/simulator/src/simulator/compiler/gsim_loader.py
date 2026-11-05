"""gsim_loader — compatibility loader for legacy .gsim (schema_version=1) and v2 .gsim_sch.

This module exists because the kernel-sidecar IPC handler and some fixtures still
import ``simulator.compiler.gsim_loader``.

Public API
----------
load(source) -> dict | ModelDocument
    - If schema_version == 2: delegates to :mod:`simulator.compiler.gsim_sch_loader`.
    - If schema_version == 1: returns the parsed dict unchanged (legacy format).

load_gsim(source) -> dict | ModelDocument
    Alias for :func:`load`.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

from simulator.compiler import gsim_sch_loader
from simulator.compiler.gsim_sch_loader import GsimSchValidationError


def load(
    source: pathlib.Path | str | dict[str, Any],
) -> dict[str, Any] | gsim_sch_loader.ModelDocument:
    """Load a v1 ``.gsim`` or v2 ``.gsim_sch`` document.

    Parameters
    ----------
    source:
        A file path, JSON string, or already-parsed dict.

    Returns
    -------
    dict | ModelDocument
        For schema_version=1 returns the dict; for schema_version=2 returns a
        :class:`~simulator.compiler.gsim_sch_loader.ModelDocument`.
    """

    doc = _ingest(source)
    version = doc.get("schema_version")

    # v2: validated loader.
    if version == 2:
        return gsim_sch_loader.load(doc)

    # v1: keep legacy payload shape, but still enforce integer coordinates
    # (same invariant as v2 loader), so downstream IR stages never see floats.
    if version == 1:
        model = doc.get("model")
        if not isinstance(model, dict):
            raise ValueError("Invalid gsim document: expected 'model' object")
        _check_float_coords(model, "model")
        return doc

    raise ValueError(f"Unsupported gsim schema_version: {version!r}")


def load_gsim(
    source: pathlib.Path | str | dict[str, Any],
) -> dict[str, Any] | gsim_sch_loader.ModelDocument:
    """Alias for :func:`load` (legacy name used by older tests/docs)."""

    return load(source)


def _ingest(source: pathlib.Path | str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(source, dict):
        return source

    if isinstance(source, str | pathlib.Path):
        text = str(source)
        stripped = text.lstrip()
        if stripped.startswith("{"):
            try:
                result: dict[str, Any] = json.loads(text)
                return result
            except json.JSONDecodeError:
                pass

        p = pathlib.Path(source)
        with p.open("r", encoding="utf-8") as fh:
            result = json.load(fh)
            return result

    raise TypeError(f"Expected path, JSON string, or dict; got {type(source).__name__!r}")


def _check_float_coords(model: dict[str, Any], prefix: str) -> None:
    blocks: list[dict[str, Any]] = model.get("blocks", [])
    for bidx, block in enumerate(blocks):
        pos = block.get("position")
        if pos is not None:
            _assert_int_pair(pos, f"{prefix}.blocks[{bidx}].position")
        sub = block.get("subsystem")
        if isinstance(sub, dict):
            _check_float_coords(sub, f"{prefix}.blocks[{bidx}].subsystem")

    wires: list[dict[str, Any]] = model.get("wires", [])
    for widx, wire in enumerate(wires):
        for wpidx, wp in enumerate(wire.get("waypoints", [])):
            _assert_int_pair(wp, f"{prefix}.wires[{widx}].waypoints[{wpidx}]")


def _assert_int_pair(pair: Any, path: str) -> None:
    if not isinstance(pair, list) or len(pair) != 2:
        raise GsimSchValidationError(
            f"Invalid coordinate pair at {path}: expected [int, int], got {pair!r}"
        )
    for i, v in enumerate(pair):
        if not isinstance(v, int) or isinstance(v, bool):
            raise GsimSchValidationError(
                f"Float coordinate at {path}[{i}]: coordinates must be integers, got {v!r}"
            )
