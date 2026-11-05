"""schema_loader: loads and validates .gsim_sch v2 documents (BE-29)."""

from __future__ import annotations

import json
import pathlib
from typing import Any

try:
    import jsonschema  # type: ignore[import-untyped]

    _HAS_JSONSCHEMA = True
except ImportError:
    _HAS_JSONSCHEMA = False


def _find_schema_path() -> pathlib.Path:
    here = pathlib.Path(__file__).resolve()
    for parent in here.parents:
        candidate = (
            parent / "packages" / "schemas" / "definitions" / "model" / "gsim_sch.schema.json"
        )
        if candidate.exists():
            return candidate
    # packages/simulator/src/simulator/compiler/schema_loader.py → up 5 to repo root
    return (
        here.parents[5] / "packages" / "schemas" / "definitions" / "model" / "gsim_sch.schema.json"
    )


def load(source: pathlib.Path | str | dict[str, Any]) -> dict[str, Any]:
    """Load and validate a .gsim_sch v2 document.

    Accepts a file path, a JSON string, or an already-parsed dict.
    Raises ValueError with a structured message on any validation failure.
    """
    if isinstance(source, dict):
        doc = source
    elif isinstance(source, str | pathlib.Path):
        p = pathlib.Path(source)
        with p.open("r", encoding="utf-8") as f:
            doc = json.load(f)
    else:
        raise TypeError(f"Expected path, str, or dict; got {type(source)}")

    version = doc.get("schema_version")
    if version != 2:
        raise ValueError(f"Unsupported gsim_sch schema_version: {version!r}")

    _check_float_coordinates(doc)

    if _HAS_JSONSCHEMA:
        schema_path = _find_schema_path()
        if schema_path.exists():
            with schema_path.open("r", encoding="utf-8") as f:
                schema = json.load(f)
            try:
                jsonschema.validate(doc, schema)
            except jsonschema.ValidationError as exc:
                raise ValueError(f"gsim_sch schema validation failed: {exc.message}") from exc

    return doc


def _check_float_coordinates(doc: dict[str, Any]) -> None:
    """Reject float coordinates and waypoints anywhere in the document."""
    model = doc.get("model", {})
    _check_model_coordinates(model, "model")


def _check_model_coordinates(model: dict[str, Any], path: str) -> None:
    for block in model.get("blocks", []):
        bid = block.get("id", "<unknown>")
        pos = block.get("position")
        if pos is not None:
            _assert_int_pair(pos, f"{path}.blocks[{bid!r}].position")
        subsystem = block.get("subsystem")
        if subsystem and isinstance(subsystem, dict):
            _check_model_coordinates(subsystem, f"{path}.blocks[{bid!r}].subsystem")

    for wire in model.get("wires", []):
        wid = wire.get("id", "<unknown>")
        for i, wp in enumerate(wire.get("waypoints", [])):
            _assert_int_pair(wp, f"{path}.wires[{wid!r}].waypoints[{i}]")


def _assert_int_pair(pair: Any, field_path: str) -> None:
    if (
        not isinstance(pair, list)
        or len(pair) != 2
        or not all(isinstance(v, int) and not isinstance(v, bool) for v in pair)
    ):
        raise ValueError(
            f"Float coordinate at {field_path}: coordinates must be integer pairs, got {pair!r}"
        )
