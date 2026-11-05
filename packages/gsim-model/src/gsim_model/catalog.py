"""Catalog metadata lookup — reads a block type's port geometry (side,
offset) and symbol bbox straight from its ``metadata.yaml``, for callers
doing schematic layout (see :mod:`gsim_model.layout`) who need to know
where a block's ports actually sit before they can route a wire to them.

Kept separate from :mod:`gsim_model.layout` (which is pure geometry, no
filesystem access) so layout math stays usable without a catalog on disk
— e.g. against blocks described inline for a test.
"""

from __future__ import annotations

import functools
import pathlib
from dataclasses import dataclass

import yaml

from gsim_model.layout import BBox, PortGeometry


@dataclass(frozen=True)
class SymbolGeometry:
    bbox: BBox
    ports: dict[str, PortGeometry]  # port id -> geometry, inputs+outputs merged


def _find_blocks_root() -> pathlib.Path:
    here = pathlib.Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "packages" / "blocks" / "src" / "blocks"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError("could not locate packages/blocks/src/blocks from " + str(here))


@functools.cache
def _blocks_root() -> pathlib.Path:
    return _find_blocks_root()


@functools.cache
def load_symbol_geometry(block_type: str, blocks_root: pathlib.Path | None = None) -> SymbolGeometry:
    """Load *block_type*'s (e.g. ``"physical-electrical.passive.resistor"``)
    port sides/offsets and symbol bbox from its catalog ``metadata.yaml``.

    Raises FileNotFoundError if no such block directory exists.
    """
    root = blocks_root or _blocks_root()
    path = root / pathlib.Path(*block_type.split(".")) / "metadata.yaml"
    if not path.exists():
        raise FileNotFoundError(f"no metadata.yaml for block type {block_type!r} at {path}")

    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    bbox = tuple(data["symbol"]["bbox"])
    ports: dict[str, PortGeometry] = {}
    for group in ("inputs", "outputs"):
        for port in data.get("ports", {}).get(group, []):
            if "side" in port and "offset" in port:
                ports[port["id"]] = PortGeometry(side=port["side"], offset=port["offset"])
    return SymbolGeometry(bbox=bbox, ports=ports)
