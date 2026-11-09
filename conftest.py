"""Repository-wide pytest fixtures.

The one thing that belongs here: a single place that answers "can this checkout
actually run a `general-simulator` solve?". Two pieces of that path are installed
by hand rather than locked — `gsim_tools` (private sibling repository) and
`gsim_py` (a compiled PyO3 extension) — see the note in the root
`pyproject.toml` under `[tool.uv.sources]`. A checkout without them is a
perfectly good checkout; it just cannot take the default solve path.

Before this existed, the tests that need that path asserted `status == "ok"` and
failed with `SolverUnavailable` wherever it was absent — which read as a broken
product rather than an absent optional component, and was invisible anyway
because CI's pytest step pointed at two empty directories (#32).
"""

from __future__ import annotations

import pytest


def _importable(module: str) -> bool:
    try:
        __import__(module)
    except ImportError:
        return False
    return True


def gsim_compile_path_available() -> bool:
    """True when a `.gsim_sch` document can be compiled to a netlist here.

    Needs `gsim_tools` only — the compile step itself. `gsim_py` is imported
    lazily inside it and is a separate question (`gsim_solve_path_available`).
    """
    return _importable("simulator.compiler.gsim_py_netlist")


def gsim_solve_path_available() -> bool:
    """True when a document can be compiled *and* handed to a solver here."""
    return gsim_compile_path_available() and _importable("gsim_py")


@pytest.fixture
def requires_gsim_compile_path() -> None:
    """Skip unless `.gsim_sch` -> netlist compilation is possible in this venv."""
    if not gsim_compile_path_available():
        pytest.skip(
            "gsim-tools is not installed in this interpreter — it is hand-installed, "
            "not locked (see the root pyproject.toml's [tool.uv.sources] note): "
            "uv pip install -e <sibling-repos-root>/gsim-tools"
        )


@pytest.fixture
def requires_gsim_solve_path(requires_gsim_compile_path: None) -> None:
    """Skip unless a full general-simulator solve is possible in this venv."""
    if not _importable("gsim_py"):
        pytest.skip(
            "gsim_py is not built for this interpreter — see "
            "packages/simulator/src/simulator/compiler/gsim_py_netlist.py's own "
            "module doc comment for the maturin step"
        )
