"""Catalog metadata lookup — a block type's port geometry (side, offset) and
symbol bbox, for callers doing schematic layout (see :mod:`gsim_model.layout`)
who need to know where a block's ports sit before they can route a wire.

The engine is the catalogue. ``general-simulator`` declares every component it
has -- label, ports, geometry, parameters -- and this module reads that
declaration through ``gsim_py.catalog()``. It used to read a second
description, ``packages/blocks/**/metadata.yaml``, maintained by hand beside
the engine's own; the two drifted, and the hand-written one is gone.

``blocks_root`` is the exception, and a deliberate one: an *authored*
component is a directory with its own ``metadata.yaml`` (see
:mod:`gsim_model.gsim_sym`), which no engine knows about yet. Passing a root
reads that directory instead of asking the engine.

Kept separate from :mod:`gsim_model.layout` (pure geometry, no I/O) so layout
math stays usable without any catalogue at all -- e.g. against blocks
described inline for a test.
"""

from __future__ import annotations

import functools
import pathlib
from dataclasses import dataclass
from typing import Any

import yaml

from gsim_model.layout import BBox, PortGeometry


@dataclass(frozen=True)
class SymbolGeometry:
    bbox: BBox
    ports: dict[str, PortGeometry]  # port id -> geometry, inputs+outputs merged


class CatalogUnavailableError(RuntimeError):
    """The engine's catalogue could not be read."""


@functools.cache
def _engine_catalog() -> dict[str, dict[str, Any]]:
    """Every component the engine declares, keyed by type, name and alias.

    Keyed three ways because a saved document may name a block by any of them:
    the catalogue carries `type` for 143 of its entries and `name` for all of
    them, and `aliases` is how an older spelling keeps resolving.
    """
    try:
        import json

        import gsim_py
    except ImportError as exc:  # pragma: no cover - depends on the environment
        raise CatalogUnavailableError(
            "gsim_py is not importable, so the engine's catalogue cannot be read. "
            "Install the gsim-core Python bindings (see the root pyproject.toml)."
        ) from exc

    raw = gsim_py.catalog()
    data = json.loads(raw) if isinstance(raw, str) else raw
    by_key: dict[str, dict[str, Any]] = {}
    for component in data["components"]:
        for key in (component.get("name"), component.get("type"), component.get("id")):
            if key:
                by_key.setdefault(key, component)
        for alias in component.get("aliases") or []:
            by_key.setdefault(alias, component)
    return by_key


def _geometry_from_entry(entry: dict[str, Any]) -> SymbolGeometry:
    bbox = tuple(entry["symbol"]["bbox"])
    ports: dict[str, PortGeometry] = {}
    for group in ("inputs", "outputs"):
        for port in (entry.get("ports") or {}).get(group, []) or []:
            if "side" in port and "offset" in port:
                ports[port["id"]] = PortGeometry(side=port["side"], offset=port["offset"])
    return SymbolGeometry(bbox=bbox, ports=ports)


@functools.cache
def load_symbol_geometry(
    block_type: str, blocks_root: pathlib.Path | None = None
) -> SymbolGeometry:
    """Load *block_type*'s (e.g. ``"physical-electrical.passive.resistor"``)
    port sides/offsets and symbol bbox.

    Reads the engine's catalogue, or, when *blocks_root* is given, the
    authored component directory under it.

    Raises FileNotFoundError if no such block exists in whichever source was
    consulted.
    """
    if blocks_root is not None:
        path = blocks_root / pathlib.Path(*block_type.split(".")) / "metadata.yaml"
        if not path.exists():
            raise FileNotFoundError(f"no metadata.yaml for block type {block_type!r} at {path}")
        return _geometry_from_entry(yaml.safe_load(path.read_text(encoding="utf-8")))

    entry = _engine_catalog().get(block_type)
    if entry is None:
        raise FileNotFoundError(f"the engine's catalogue has no block type {block_type!r}")
    return _geometry_from_entry(entry)
