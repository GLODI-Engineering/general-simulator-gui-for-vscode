"""GSF .gsim_sym file I/O + catalog merge.

``.gsim_sym`` is a portable single-component authoring/exchange file — the
JSON serialization of one :class:`gsim_model.symbol.ComponentDefinition`,
self-describing (embeds ``name``/``type``, unlike a bare ``metadata.yaml``
which relies on its catalog directory path). It is never read by the
compiler or the frontend directly: :func:`merge_into_catalog` is the only
bridge from a ``.gsim_sym`` file into the real catalog tree
(``packages/blocks/src/blocks/**/metadata.yaml``), which stays the single
source of truth the build pipeline reads. See
``docs/specs/gsim-symbol-format-spec.md`` §1.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any, cast

import yaml

from gsim_model.symbol import (
    Arc,
    Circle,
    ComponentDefinition,
    Line,
    Polygon,
    Polyline,
    Primitive,
    Rect,
    RectF,
    SymbolBuilder,
    Text,
)

_PRIMITIVE_KINDS: dict[str, type[Primitive]] = {
    "line": Line,
    "rect": Rect,
    "rectf": RectF,
    "circle": Circle,
    "arc": Arc,
    "polygon": Polygon,
    "polyline": Polyline,
    "text": Text,
}


def _primitive_from_dict(d: dict[str, Any]) -> Primitive:
    d = dict(d)
    kind = d.pop("type")
    cls = _PRIMITIVE_KINDS.get(kind)
    if cls is None:
        raise ValueError(f"unknown GSF primitive type {kind!r}")
    if "pts" in d:
        d["pts"] = tuple(tuple(pt) for pt in d["pts"])
    return cls(**d)


def _symbol_builder_from_dict(data: dict[str, Any]) -> SymbolBuilder:
    symbol = data["symbol"]
    builder = SymbolBuilder(bbox=tuple(symbol["bbox"]))
    for prim_dict in symbol.get("primitives", []):
        builder.add(_primitive_from_dict(prim_dict))
    ports = data.get("ports", {})
    for entry in ports.get("inputs", []):
        builder.port(
            id=entry["id"],
            side=entry["side"],
            offset=entry["offset"],
            kind=entry["kind"]["domain"],
            direction="input",
            label=entry.get("label"),
        )
    for entry in ports.get("outputs", []):
        builder.port(
            id=entry["id"],
            side=entry["side"],
            offset=entry["offset"],
            kind=entry["kind"]["domain"],
            direction="output",
            label=entry.get("label"),
        )
    return builder


def component_from_dict(data: dict[str, Any]) -> ComponentDefinition:
    """Reconstruct a :class:`ComponentDefinition` from a plain dict matching
    ``ComponentDefinition.to_dict()``'s shape (a loaded ``.gsim_sym`` or
    ``metadata.yaml`` body)."""
    symbol_text = cast(str | None, data.get("symbol", {}).get("text"))
    return ComponentDefinition(
        name=data["name"],
        type=data.get("type"),
        label=data["label"],
        version=data["version"],
        category=data["category"],
        description=data["description"],
        paradigm=data["paradigm"],
        domain=data["domain"],
        symbol_builder=_symbol_builder_from_dict(data),
        aliases=list(data.get("aliases", [])),
        tags=list(data.get("tags", [])),
        params=list(data.get("params", [])),
        fidelities=list(data.get("fidelities", [])),
        behavior=data.get("behavior"),
        symbol_text=symbol_text,
    )


def save_gsim_sym(component: ComponentDefinition, path: pathlib.Path | str) -> None:
    """Write *component* as a canonical, byte-stable ``.gsim_sym`` JSON file."""
    text = json.dumps(component.to_dict(), indent=2, sort_keys=True) + "\n"
    pathlib.Path(path).write_text(text, encoding="utf-8")


def load_gsim_sym(path: pathlib.Path | str) -> ComponentDefinition:
    """Load a ``.gsim_sym`` file back into a :class:`ComponentDefinition`."""
    data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    return component_from_dict(data)


def merge_into_catalog(
    component: ComponentDefinition, blocks_root: pathlib.Path | str
) -> pathlib.Path:
    """Write/overwrite *component*'s ``metadata.yaml`` under *blocks_root*,
    at the path derived from ``component.type`` (falling back to
    ``component.name`` when ``type`` is unset, mirroring the schema's own
    "type omitted -> name is the catalog type" rule). This is the only
    bridge from a GSF-authored component into the real catalog tree that
    ``gsim_model.catalog.load_symbol_geometry()`` and the frontend's
    catalog-manifest build already read.
    """
    type_path = component.type or component.name
    directory = pathlib.Path(blocks_root, *type_path.split("."))
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "metadata.yaml"
    data = component.to_dict()
    with path.open("w", encoding="utf-8") as fh:
        yaml.safe_dump(data, fh, sort_keys=False, allow_unicode=True)
    return path
