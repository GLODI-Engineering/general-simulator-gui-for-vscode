"""Equation template loader (BE-10).

Discovers every equations.py under packages/blocks/src/blocks/**/,
imports it lazily, and cross-validates state_vars() against the block's
metadata behavior.state_count.
"""

from __future__ import annotations

import importlib.util
import logging
import pathlib
import types
from typing import Any

import yaml

from simulator.equation_templates.protocol import BlockEquations

logger = logging.getLogger(__name__)

_BLOCKS_ROOT = pathlib.Path(__file__).parents[6] / "packages" / "blocks" / "src" / "blocks"
_CIRCUIT_PREFIXES = ("passive.", "source.", "semi.", "tline.")


def _load_module_from_path(module_name: str, path: pathlib.Path) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _load_metadata(metadata_path: pathlib.Path) -> dict[str, Any]:
    with metadata_path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)  # type: ignore[no-any-return]


class TemplateEntry:
    def __init__(
        self,
        template_key: str,
        equations: BlockEquations,
        origin_path: pathlib.Path,
        metadata: dict[str, Any],
    ) -> None:
        self.template_key = template_key
        self.equations = equations
        self.origin_path = origin_path
        # Keep origin as an alias for backwards compat.
        self.origin = origin_path
        self.metadata = metadata


class TemplateRegistry:
    def __init__(self) -> None:
        self._templates: dict[str, TemplateEntry] = {}

    def register(self, entry: TemplateEntry) -> None:
        self._templates[entry.template_key] = entry

    def get(self, key: str) -> TemplateEntry | None:
        return self._templates.get(key)

    def __getitem__(self, key: str) -> TemplateEntry:
        return self._templates[key]

    def __contains__(self, key: object) -> bool:
        return key in self._templates

    def keys(self) -> list[str]:
        return list(self._templates.keys())

    def __len__(self) -> int:
        return len(self._templates)

    @classmethod
    def discover(
        cls,
        extra_roots: list[pathlib.Path] | None = None,
    ) -> TemplateRegistry:
        """Discover and load all equation templates.

        Args:
            extra_roots: Additional root directories to search for
                ``blocks/**/equations.py`` files.  Each entry is treated as a
                directory that contains a ``blocks/`` sub-tree (i.e.
                ``<root>/blocks/<category>/<name>/equations.py``).

        Raises:
            ValueError: If any discovered template has a mismatched
                state_count.  This makes misconfiguration visible during
                testing.
        """
        registry = cls()
        roots: list[pathlib.Path] = [_discover_blocks_root()]
        if extra_roots:
            for r in extra_roots:
                candidate = r / "blocks"
                if candidate.is_dir():
                    roots.append(candidate)
                elif r.is_dir():
                    roots.append(r)

        errors: list[str] = []

        for root in roots:
            if not root.is_dir():
                logger.warning("Blocks root not found: %s", root)
                continue

            for metadata_path in sorted(root.rglob("metadata.yaml")):
                eq_path = metadata_path.parent / "equations.py"
                if eq_path.exists():
                    continue
                try:
                    metadata = _load_metadata(metadata_path)
                except Exception:
                    logger.exception("Failed to load metadata: %s", metadata_path)
                    continue
                block_name = str(metadata.get("name", ""))
                if any(block_name.startswith(prefix) for prefix in _CIRCUIT_PREFIXES):
                    logger.debug(
                        "Skipping equations.py requirement for circuit-domain block %s at %s",
                        block_name,
                        metadata_path,
                    )

            for eq_path in sorted(root.rglob("equations.py")):
                metadata_path = eq_path.parent / "metadata.yaml"
                if not metadata_path.exists():
                    logger.warning("equations.py without metadata.yaml: %s", eq_path)
                    continue

                try:
                    metadata = _load_metadata(metadata_path)
                except Exception:
                    logger.exception("Failed to load metadata: %s", metadata_path)
                    continue

                template_key: str = metadata.get("behavior", {}).get(
                    "equation_template", metadata.get("name", "")
                )
                if not template_key:
                    logger.warning("No template key in metadata: %s", metadata_path)
                    continue

                module_name = f"_block_eq_{template_key.replace('.', '_')}"
                try:
                    mod = _load_module_from_path(module_name, eq_path)
                    equations_cls = getattr(mod, "Equations", None)
                    if equations_cls is None:
                        raise AttributeError(f"No 'Equations' class in {eq_path}")
                    equations: BlockEquations = equations_cls()
                except Exception:
                    logger.exception("Failed to import equations template: %s", eq_path)
                    continue

                # Cross-validate state_vars() against metadata.state_count.
                state_count_meta = metadata.get("behavior", {}).get("state_count")
                if state_count_meta != "dynamic":
                    try:
                        defaults = {p["name"]: p.get("default") for p in metadata.get("params", [])}
                        state_vars_fn = getattr(equations, "state_vars", None)
                        state_vars = state_vars_fn(defaults) if callable(state_vars_fn) else []
                        expected = int(state_count_meta) if state_count_meta is not None else 0
                        if len(state_vars) != expected:
                            msg = (
                                f"state_vars() returned {len(state_vars)} vars but "
                                f"metadata.state_count is {expected} for {eq_path}"
                            )
                            errors.append(msg)
                            continue
                    except Exception as exc:
                        errors.append(f"state_vars cross-validation failed for {eq_path}: {exc}")
                        continue

                registry.register(TemplateEntry(template_key, equations, eq_path, metadata))
                logger.debug("Loaded template: %s from %s", template_key, eq_path)

        if errors:
            raise ValueError("Template registry errors:\n" + "\n".join(errors))

        return registry


def _discover_blocks_root() -> pathlib.Path:
    """Find packages/blocks/src/blocks/ relative to this file."""
    here = pathlib.Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "packages" / "blocks" / "src" / "blocks"
        if candidate.is_dir():
            return candidate
    # Fallback: packages/simulator/src/simulator/equation_templates/loader.py
    # → up 5 levels to repo root.
    return here.parents[5] / "packages" / "blocks" / "src" / "blocks"


def load_all_templates(blocks_root: pathlib.Path | None = None) -> TemplateRegistry:
    """Backwards-compatible wrapper around TemplateRegistry.discover()."""
    extra = [blocks_root.parent] if blocks_root else None
    try:
        return TemplateRegistry.discover(extra_roots=extra)
    except ValueError:
        # legacy callers expect silent skip; log and return partial registry
        logger.exception("Template validation errors (suppressed by legacy caller)")
        return TemplateRegistry()


# Module-level singleton; loaded lazily.
_registry: TemplateRegistry | None = None


def get_registry() -> TemplateRegistry:
    global _registry
    if _registry is None:
        _registry = TemplateRegistry.discover()
    return _registry
