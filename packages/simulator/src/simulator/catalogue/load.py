"""Tier-aware block catalogue loader (BE-40).

Discovers tiered equation templates by scanning for::

    *_ideal.py, *_behavioral.py, *_spice.py

files under the blocks root.  Each such file is paired with a nearby
``metadata.yaml`` to determine the canonical block type.

Usage::

    from simulator.catalogue.load import CatalogueRegistry, UnsupportedBlockError

    reg = CatalogueRegistry.discover()
    entry = reg.get_template("physical-electrical.passive.resistor", "ideal")
    # entry.equations  →  an Equations instance

Unknown ``(type, fidelity)`` pairs raise :class:`UnsupportedBlockError`.
"""

from __future__ import annotations

import importlib.util
import logging
import pathlib
import types
from typing import Any

import yaml

logger = logging.getLogger(__name__)

_TIER_FILE_SUFFIXES: dict[str, str] = {
    "_ideal": "ideal",
    "_behavioral": "behavioral",
    "_spice": "spice",
}


# ---------------------------------------------------------------------------
# Public exception
# ---------------------------------------------------------------------------


class UnsupportedBlockError(KeyError):
    """Raised when no template is registered for ``(block_type, fidelity)``."""

    def __init__(self, block_type: str, fidelity: str) -> None:
        self.block_type = block_type
        self.fidelity = fidelity
        super().__init__(f"No template registered for ({block_type!r}, {fidelity!r})")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


class TieredTemplateEntry:
    """One registered (type, fidelity) → Equations mapping."""

    def __init__(
        self,
        block_type: str,
        fidelity: str,
        equations: Any,
        origin_path: pathlib.Path,
    ) -> None:
        self.block_type = block_type
        self.fidelity = fidelity
        self.equations = equations
        self.origin_path = origin_path


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class CatalogueRegistry:
    """Maps ``(block_type, fidelity)`` pairs to :class:`TieredTemplateEntry`."""

    def __init__(self) -> None:
        self._templates: dict[tuple[str, str], TieredTemplateEntry] = {}

    # ------------------------------------------------------------------
    # Mutation
    # ------------------------------------------------------------------

    def register(self, entry: TieredTemplateEntry) -> None:
        self._templates[(entry.block_type, entry.fidelity)] = entry

    # ------------------------------------------------------------------
    # Query
    # ------------------------------------------------------------------

    def get_template(self, block_type: str, fidelity: str) -> TieredTemplateEntry:
        """Return the entry for ``(block_type, fidelity)``.

        Raises:
            UnsupportedBlockError: if the pair has no registered template.
        """
        key = (block_type, fidelity)
        if key not in self._templates:
            raise UnsupportedBlockError(block_type, fidelity)
        return self._templates[key]

    def contains(self, block_type: str, fidelity: str) -> bool:
        return (block_type, fidelity) in self._templates

    def __contains__(self, key: object) -> bool:
        return key in self._templates

    def all_pairs(self) -> list[tuple[str, str]]:
        return list(self._templates.keys())

    def __len__(self) -> int:
        return len(self._templates)

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    @classmethod
    def discover(
        cls,
        blocks_root: pathlib.Path | None = None,
    ) -> CatalogueRegistry:
        """Scan *blocks_root* for ``*_ideal.py``, ``*_behavioral.py``,
        ``*_spice.py`` files and build the registry.

        Each tiered file must sit next to a ``metadata.yaml`` that provides
        the canonical ``type`` field.
        """
        registry = cls()
        root = blocks_root or _discover_blocks_root()

        if not root.is_dir():
            logger.warning("Blocks root not found: %s", root)
            return registry

        for suffix, fidelity in _TIER_FILE_SUFFIXES.items():
            for tier_path in sorted(root.rglob(f"*{suffix}.py")):
                metadata_path = tier_path.parent / "metadata.yaml"
                if not metadata_path.exists():
                    logger.debug("No metadata.yaml alongside %s — skipping", tier_path)
                    continue

                try:
                    with metadata_path.open("r", encoding="utf-8") as fh:
                        metadata: dict[str, Any] = yaml.safe_load(fh)
                except Exception:
                    logger.exception("Failed to parse metadata: %s", metadata_path)
                    continue

                block_type: str = metadata.get("type", "")
                if not block_type:
                    logger.warning("metadata.yaml has no 'type' field: %s", metadata_path)
                    continue

                module_name = (
                    "_cat_eq_" + block_type.replace("-", "_").replace(".", "_") + "_" + fidelity
                )
                try:
                    mod = _load_module(module_name, tier_path)
                    equations_cls = getattr(mod, "Equations", None)
                    if equations_cls is None:
                        raise AttributeError(f"No 'Equations' class found in {tier_path}")
                    equations = equations_cls()
                except Exception:
                    logger.exception("Failed to import tier template: %s", tier_path)
                    continue

                entry = TieredTemplateEntry(block_type, fidelity, equations, tier_path)
                registry.register(entry)
                logger.debug(
                    "Catalogue: registered (%s, %s) from %s",
                    block_type,
                    fidelity,
                    tier_path,
                )

        return registry


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_module(module_name: str, path: pathlib.Path) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _discover_blocks_root() -> pathlib.Path:
    """Locate ``packages/blocks/src/blocks/`` relative to this file."""
    here = pathlib.Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "packages" / "blocks" / "src" / "blocks"
        if candidate.is_dir():
            return candidate
    # Fallback: up 6 levels from  .../simulator/src/simulator/catalogue/load.py
    return here.parents[5] / "packages" / "blocks" / "src" / "blocks"


# ---------------------------------------------------------------------------
# Module-level singleton (lazy)
# ---------------------------------------------------------------------------

_registry: CatalogueRegistry | None = None


def get_catalogue_registry() -> CatalogueRegistry:
    """Return the process-wide singleton registry (built on first call)."""
    global _registry
    if _registry is None:
        _registry = CatalogueRegistry.discover()
    return _registry
