"""Tier-aware block catalogue package (BE-40)."""

from simulator.catalogue.load import (
    CatalogueRegistry,
    TieredTemplateEntry,
    UnsupportedBlockError,
    get_catalogue_registry,
)

__all__ = [
    "CatalogueRegistry",
    "TieredTemplateEntry",
    "UnsupportedBlockError",
    "get_catalogue_registry",
]
