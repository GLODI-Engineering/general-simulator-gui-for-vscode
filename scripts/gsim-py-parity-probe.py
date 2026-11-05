#!/usr/bin/env python3
"""Measure how far `gsim-py`/`gsim-core` is from replacing this repo's compile path.

Consolidating the two parallel compiler implementations (this repo's Python
`simulator.compiler.*` and the Rust `gsim-core`) is the goal; this script is how the
distance is *measured* rather than estimated, and how the numbers quoted in
`gsim-core/docs/decisions/0003-general-simulator-gui-pipeline-parity.md` are regenerated.

It is deliberately not a pytest: it needs a `gsim_py` wheel built out of a sibling
repo, which is not — and should not become — a dependency of this workspace while the
answer is still "not close enough to wire in".

    python3 -m venv .venv && . .venv/bin/activate
    maturin build --release -m ../gsim-core/crates/gsim-py/Cargo.toml --out wheels
    pip install wheels/*.whl
    python3 scripts/gsim-py-parity-probe.py
"""

from __future__ import annotations

import glob
import json
import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def probe_fixtures(gsim_py) -> int:
    """Run every .gsim_sch in the repo through gsim-core's loader and compiler."""
    failures = 0
    paths = sorted(glob.glob(os.path.join(REPO_ROOT, "**", "*.gsim_sch"), recursive=True))
    print(f"== {len(paths)} .gsim_sch fixture(s) ==\n")
    for path in paths:
        rel = os.path.relpath(path, REPO_ROOT)
        with open(path, encoding="utf-8") as fh:
            raw = fh.read()
        print(rel)
        try:
            gsim_py.load_document(raw)
            print("  load_document  OK")
        except Exception as exc:
            failures += 1
            print(f"  load_document  FAILED  {type(exc).__name__}: {exc}")
            continue
        # compile() takes a Model, not the enclosing {"schema_version": 2, "model": ...}
        # document — handing it the document fails with a bare "missing field `id`".
        model_json = json.dumps(json.loads(raw)["model"])
        try:
            out = json.loads(gsim_py.compile(model_json, "general-simulator"))
            print(f"  compile        OK  ({len(out['netlist'].splitlines())} lines)")
            for note in out.get("notes", []):
                print(f"    note: {note}")
        except Exception as exc:
            failures += 1
            print(f"  compile        FAILED  {exc}")
        print()
    return failures


def probe_validation(gsim_py) -> None:
    """Compare gsim-core's document validation against gsim_sch_loader's."""
    base = {
        "schema_version": 2,
        "model": {"id": "m", "name": "m", "grid": 10, "params": [], "blocks": [], "wires": []},
    }

    def run(label: str, mutate) -> None:
        doc = json.loads(json.dumps(base))
        mutate(doc)
        try:
            gsim_py.load_document(json.dumps(doc))
            verdict = "ACCEPTED"
        except Exception as exc:
            verdict = f"rejected -- {exc}"
        print(f"  {label:36s} {verdict}")

    print("== gsim_py.load_document validation coverage ==\n")
    run(
        "float coordinate",
        lambda d: d["model"].update(
            blocks=[{"id": "b1", "type": "passive.resistor", "position": [10.5, 20], "params": {}}]
        ),
    )
    run("invalid model.role", lambda d: d["model"].update(role="widget"))
    run("schema_version 3", lambda d: d.update(schema_version=3))
    run(
        "param cycle a->b->a",
        lambda d: d["model"].update(
            params=[{"name": "a", "value": "b"}, {"name": "b", "value": "a"}]
        ),
    )
    run(
        "param expression to evaluate",
        lambda d: d["model"].update(params=[{"name": "a", "value": "2*pi"}]),
    )
    print(
        "\n  gsim_sch_loader.load additionally rejects the last two and returns a\n"
        "  resolved_params table; gsim-core has no equivalent (Phase 1, see its\n"
        "  document/model.rs note on the {...} param-reference syntax).\n"
    )


def main() -> int:
    try:
        import gsim_py
    except ImportError:
        print(__doc__)
        print("gsim_py is not importable -- build and install the wheel first (see above).")
        return 2

    print(f"gsim_py {gsim_py.version()}\n")
    failures = probe_fixtures(gsim_py)
    probe_validation(gsim_py)

    print("== summary ==")
    print(f"  {failures} fixture stage failure(s).")
    print(
        "  Non-zero is the expected result today: gsim-core's only NetlistTarget is\n"
        "  general-simulator, and this repo's live solvers are ngspice/Xyce/scipy.\n"
        "  See gsim-core/docs/decisions/0003-general-simulator-gui-pipeline-parity.md."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
