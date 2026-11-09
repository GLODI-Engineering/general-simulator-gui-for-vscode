"""Compile a `.gsim_sch` document straight to a `general-simulator` netlist via `gsim-py`.

This is the *only* compile path a `simulate` request should take once a document is fully
authored with `general-simulator`-only catalogue types (see `packages/blocks/src/blocks/**`
and `apps/frontend/src/library/simulator-compat.yaml`, which already scope the UI's palette
that way). It deliberately does not go through `gsim_loader`/`ir1_builder`/`ir2_lowering`/
`spice_netlist_writer`/`scipy_compiler` — that whole older pipeline targets ngspice/Xyce/SciPy,
a different taxonomy (`passive.resistor` vs. `resistor`, `source.voltage.dc` vs. `voltage_dc`,
...) maintained by hand in `spice_netlist_writer.BLOCK_TO_SPICE`. `gsim-core`'s own Rust compile
registry (`compile/spec.rs`) is the real, single source of truth for what a block compiles to,
shared with the frontend's own rendering/validation via the same crate — see
`general_simulator_solver.py`'s own module doc comment for the solver half of this path.

## One-time build step

`gsim_py` is a compiled PyO3 extension (`gsim-core/crates/gsim-py`), not a pure-Python package,
so it cannot be a plain `pyproject.toml` dependency the way `gsim-tools` is (a `path` dependency
would pin one platform/interpreter's wheel into the lockfile). Build it once per interpreter:

```bash
cd <sibling-repos-root>/gsim-core/crates/gsim-py
maturin build --release --interpreter <path-to-this-repo's>/.venv/bin/python3.12
uv pip install --python <path-to-this-repo's>/.venv/bin/python3.12 \\
    ../../target/wheels/gsim_py-*.whl
```

`gsim-tools` (pure Python) needs no build step, but it is **not** a declared dependency either:
it lives in a private sibling repository, so no CI checkout can resolve a path source to it, and
an optional extra does not help because uv locks every extra. Install it the same way, once:

```bash
uv pip install -e <sibling-repos-root>/gsim-tools
```

`uv sync` prunes whatever it did not lock, so both this and the `gsim_py` wheel above need
redoing after a sync. Use `uv sync --all-packages` — a bare `uv sync` only syncs the root
project's own dependency closure in this workspace's configuration, not every member.
"""

from __future__ import annotations

import copy
import json
from typing import Any

# Re-exported so a caller can catch one name without importing gsim_tools directly —
# gsim_tools.schematic._gsim_py() already raises exactly this (a lazy `import gsim_py`
# behind every Schematic method that needs it) with a message naming the build step.
from gsim_tools.schematic import GsimPyNotAvailable

__all__ = ["GsimPyNotAvailable", "compile_gsim_document"]


#: `gsim_py.load_document` (via `gsim_tools.schematic.Schematic.load`) requires the *full*
#: `.gsim_sch` document shape, `{"schema_version": 2, "model": {...}}` — but the IPC
#: `simulate` payload's own `model` field (see `apps/frontend/src/ipc/types.ts`'s
#: `SimulateRequest.model`, and `apps/frontend/src/shell/run.ts`, which sends
#: `useGraphStore.getState().document.model`, deliberately just the inner model, not the
#: wrapping document) is the *bare* model object — `id`/`name`/`blocks`/`wires`/... at the
#: top level, no `schema_version` key at all. `_ensure_document_shape` wraps it before
#: handing it to `Schematic.load`, rather than requiring every caller of this function to
#: know that distinction.
_SCHEMA_VERSION = 2


def _ensure_document_shape(gsim_doc: dict[str, Any]) -> dict[str, Any]:
    if "schema_version" in gsim_doc and "model" in gsim_doc:
        return gsim_doc
    return {"schema_version": _SCHEMA_VERSION, "model": gsim_doc}


#: A real, confirmed cross-repo divergence, independently rediscovered and documented by
#: every one of the schematic-drawing benchmark's rows from row 2 onward (see the private
#: wiki's own row write-ups, and every benchmark script's own `CATALOGUE_PORT_NAMES`
#: constant): `gsim-core`'s compile registry (`compile/spec.rs`) and the frontend's own
#: block catalogue (`packages/blocks/src/blocks/passive/{resistor,capacitor,inductor}/
#: metadata.yaml`, `.../routing/ground/metadata.yaml`) spell these four types' port ids
#: differently. A document authored/wired through the real frontend UI — not just a
#: benchmark script — uses the catalogue's spelling, so compiling it through gsim-core's
#: registry as-is fails with `floating-port` on every wire touching one of these four
#: types, for every real document, not just a corner case. Respelling here (catalogue ->
#: gsim-core, the inverse of what every benchmark script's own
#: `retargeted_to_the_catalogue` does for rendering) is the fix, not a workaround: it
#: makes the one real ambiguity (which spelling is "correct") a solved question for this
#: bridge specifically, while the underlying two-vocabulary divergence itself — which
#: repo should actually change — stays an open, correctly-unresolved cross-repo design
#: question (recorded in the wiki, not this repo's to decide unilaterally).
_GSIM_CORE_PORT_NAMES: dict[str, dict[str, str]] = {
    "passive.resistor": {"p": "p1", "n": "p2"},
    "passive.inductor": {"p": "p1", "n": "p2"},
    "passive.capacitor": {"p": "p1", "n": "p2"},
    "routing.ground": {"gnd": "p"},
}


def _retargeted_to_gsim_core(model: dict[str, Any]) -> dict[str, Any]:
    block_types = {b["id"]: b.get("type", "") for b in model.get("blocks", [])}
    for wire in model.get("wires", []):
        for end in ("from", "to"):
            renames = _GSIM_CORE_PORT_NAMES.get(block_types.get(wire[end]["block"], ""))
            if renames and wire[end]["port"] in renames:
                wire[end]["port"] = renames[wire[end]["port"]]
    return model


def compile_gsim_document(gsim_doc: Any, target: str = "general-simulator") -> str:
    """Compile a `.gsim_sch` document (parsed dict — either the bare model object or the
    full `{schema_version, model}` document — or the JSON text of either) to a `target`
    netlist, via `gsim-core`'s own compile registry.

    Raises `GsimPyNotAvailable` if `gsim_py` isn't built for this interpreter, or one of
    `gsim_tools`' other typed compile errors (`FloatingPortError`, `MissingParamError`,
    `UnknownTypeError`, ...) if the document itself doesn't compile — both are real,
    actionable failures the caller should surface to the user, not swallow.
    """
    from gsim_tools.schematic import Schematic

    doc = json.loads(gsim_doc) if isinstance(gsim_doc, str) else copy.deepcopy(gsim_doc)
    doc = _ensure_document_shape(doc)
    doc["model"] = _retargeted_to_gsim_core(doc["model"])
    text = json.dumps(doc)
    sch = Schematic.load(text)
    # gsim_tools ships no type stubs, so `.compile()`'s real `-> str` return type is Any
    # to mypy; str() makes this function's own declared return type honest without ignoring
    # the check outright.
    return str(sch.compile(target))
