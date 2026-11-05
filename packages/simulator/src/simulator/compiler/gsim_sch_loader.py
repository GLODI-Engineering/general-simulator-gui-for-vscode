"""gsim_sch_loader — loads and validates .gsim_sch v2 documents (BE-30).

Public API
----------
load(source)  → ModelDocument
    Accepts a file path, a JSON string, or an already-parsed dict.
    Validates schema_version, JSON Schema, float coordinates, and param
    expressions.  Returns a ModelDocument dataclass on success; raises
    GsimSchValidationError on any validation failure.

GsimSchValidationError
    ValueError subclass.  The error message always names the offending field
    or param when possible.
"""

from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass
from typing import Any

try:
    import jsonschema  # type: ignore[import-untyped]

    _HAS_JSONSCHEMA = True
except ImportError:
    _HAS_JSONSCHEMA = False

from simulator.compiler.param_expression import resolve_params

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


class GsimSchValidationError(ValueError):
    """Raised by :func:`load` for any .gsim_sch v2 validation failure."""


#: Legal values of the top-level ``model.role`` field (§4.1).
MODEL_ROLES: frozenset[str] = frozenset({"schematic", "library"})

#: Role assumed when ``model.role`` is absent — every pre-role file is a schematic.
DEFAULT_MODEL_ROLE = "schematic"


@dataclass
class ModelDocument:
    """Validated .gsim_sch v2 document.

    *model* is the original dict (expressions kept as-is) so that
    ``gsim_sch_writer.write(doc)`` can reconstruct a byte-stable canonical
    file.  *resolved_params* holds the fully-evaluated param table for
    downstream compiler stages.
    """

    schema_version: int
    model: dict[str, Any]
    resolved_params: dict[str, float]

    @property
    def role(self) -> str:
        """Document role (§4.1), defaulted to ``"schematic"`` when absent.

        ``"library"`` marks reusable content — a pre-wired stamp meant to be
        copied into a parent schematic, and/or a carrier for ``subckt_defs``.
        It is an intent hint: nothing about structural validation changes, but
        callers must not offer a library document for direct simulation.
        """
        value = self.model.get("role", DEFAULT_MODEL_ROLE)
        return str(value)


# ---------------------------------------------------------------------------
# Schema path
# ---------------------------------------------------------------------------


def _find_schema_path() -> pathlib.Path:
    here = pathlib.Path(__file__).resolve()
    for parent in here.parents:
        candidate = (
            parent / "packages" / "schemas" / "definitions" / "model" / "gsim_sch.schema.json"
        )
        if candidate.exists():
            return candidate
    # Fallback: packages/simulator/src/simulator/compiler/ → up 5 → repo root
    return (
        here.parents[5] / "packages" / "schemas" / "definitions" / "model" / "gsim_sch.schema.json"
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def load(source: pathlib.Path | str | dict[str, Any]) -> ModelDocument:
    """Load and validate a .gsim_sch v2 document.

    Parameters
    ----------
    source:
        A :class:`pathlib.Path` or file-path string → opened and parsed as
        UTF-8 JSON.  A JSON string (starts with ``{`` after stripping) →
        parsed directly.  A ``dict`` → used as-is.

    Returns
    -------
    ModelDocument
        Fully validated document with resolved param table.

    Raises
    ------
    GsimSchValidationError
        For schema_version mismatches, float coordinates, invalid param
        expressions, param cycles, or JSON Schema violations.
    TypeError
        If *source* is not a path, string, or dict.
    """
    # 1. Ingest ---------------------------------------------------------------
    doc = _ingest(source)

    # 2. schema_version -------------------------------------------------------
    version = doc.get("schema_version")
    if version != 2:
        raise GsimSchValidationError(f"Unsupported gsim_sch schema_version: {version!r}")

    # 3. Float coordinate / waypoint check (§17.1) — runs before JSON Schema
    #    so the error carries the exact path (model.blocks[N].position[I]).
    model: dict[str, Any] = doc.get("model", {})
    _check_float_coords(model, "model")

    # 4. Document role (§4.1) — checked before JSON Schema so a bad value gets a
    #    field-specific message instead of a generic enum violation.
    _check_role(model)

    # 5. JSON Schema validation -----------------------------------------------
    _validate_json_schema(doc)

    # 6. Param expression resolution (§5.2, §17.3) ----------------------------
    raw_params: list[dict[str, Any]] = model.get("params", [])
    try:
        resolved = resolve_params(raw_params)
    except (ValueError, SyntaxError) as exc:
        raise GsimSchValidationError(str(exc)) from exc

    return ModelDocument(
        schema_version=int(version),
        model=model,
        resolved_params=resolved,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _ingest(source: pathlib.Path | str | dict[str, Any]) -> dict[str, Any]:
    if isinstance(source, dict):
        return source
    if isinstance(source, str | pathlib.Path):
        text = str(source)
        # Heuristic: if it looks like raw JSON, parse it directly.
        stripped = text.lstrip()
        if stripped.startswith("{"):
            try:
                result: dict[str, Any] = json.loads(text)
                return result
            except json.JSONDecodeError:
                pass
        # Otherwise treat as a file path.
        p = pathlib.Path(source)
        with p.open("r", encoding="utf-8") as fh:
            result = json.load(fh)
            return result
    raise TypeError(f"Expected path, JSON string, or dict; got {type(source).__name__!r}")


def _validate_json_schema(doc: dict[str, Any]) -> None:
    if not _HAS_JSONSCHEMA:
        return
    schema_path = _find_schema_path()
    if not schema_path.exists():
        return
    with schema_path.open("r", encoding="utf-8") as fh:
        schema = json.load(fh)
    try:
        jsonschema.validate(doc, schema)
    except jsonschema.ValidationError as exc:
        raise GsimSchValidationError(f"JSON Schema validation failed: {exc.message}") from exc


def _check_role(model: dict[str, Any]) -> None:
    """Reject a present-but-invalid ``model.role`` (§4.1, §17.1.7)."""
    if "role" not in model:
        return
    role = model["role"]
    if role not in MODEL_ROLES:
        allowed = ", ".join(sorted(MODEL_ROLES))
        raise GsimSchValidationError(f"Invalid model role {role!r}: expected one of {allowed}")


def _check_float_coords(model: dict[str, Any], prefix: str) -> None:
    """Recursively reject float coordinates in *model* at *prefix*."""
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
    """Raise GsimSchValidationError if *pair* is not a list of two integers."""
    if not isinstance(pair, list) or len(pair) != 2:
        raise GsimSchValidationError(
            f"Invalid coordinate pair at {path}: expected [int, int], got {pair!r}"
        )
    for i, v in enumerate(pair):
        if not isinstance(v, int) or isinstance(v, bool):
            raise GsimSchValidationError(
                f"Float coordinate at {path}[{i}]: coordinates must be integers, got {v!r}"
            )
