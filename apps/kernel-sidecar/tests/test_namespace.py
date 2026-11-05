"""BE-04 — Persistent Python namespace tests.

Covers:
- Pre-imports present (numpy, scipy, matplotlib.pyplot, pandas, sympy, pi, e).
- User-set names persist across exec calls within one Namespace instance.
- Reset clears user names but restores pre-imports.
"""

from __future__ import annotations

import pytest

# ---------------------------------------------------------------------------
# Import guard — xfail if namespace module is a stub
# ---------------------------------------------------------------------------


def _import_namespace():  # type: ignore[no-untyped-def]
    try:
        from kernel_sidecar.kernel.namespace import Namespace

        return Namespace
    except (ImportError, AttributeError):
        pytest.xfail("kernel_sidecar.kernel.namespace not yet implemented")


# ---------------------------------------------------------------------------
# Pre-imports
# ---------------------------------------------------------------------------


def test_numpy_present() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    assert "np" in ns.globals


def test_scipy_present() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    assert "scipy" in ns.globals


def test_matplotlib_pyplot_present() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    assert "plt" in ns.globals


def test_pandas_present() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    assert "pd" in ns.globals


def test_sympy_present() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    assert "sympy" in ns.globals


def test_pi_alias_present() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    import math

    assert "pi" in ns.globals
    assert abs(ns.globals["pi"] - math.pi) < 1e-12


def test_e_alias_present() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    import math

    assert "e" in ns.globals
    assert abs(ns.globals["e"] - math.e) < 1e-12


def test_pre_imports_are_importable() -> None:
    """np, scipy, plt, pd, sympy must be the real modules (not None / stubs)."""
    Namespace = _import_namespace()
    ns = Namespace()
    g = ns.globals
    import matplotlib.pyplot
    import numpy
    import pandas
    import scipy
    import sympy

    assert g["np"] is numpy
    assert g["scipy"] is scipy
    assert g["plt"] is matplotlib.pyplot
    assert g["pd"] is pandas
    assert g["sympy"] is sympy


# ---------------------------------------------------------------------------
# Persistence across execs
# ---------------------------------------------------------------------------


def test_user_name_persists_across_calls() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    ns.exec("x = 5")
    ns.exec("y = x * 2")
    assert ns.globals.get("y") == 10


def test_exec_increments_accumulate() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    ns.exec("acc = 0")
    for _ in range(5):
        ns.exec("acc += 1")
    assert ns.globals["acc"] == 5


# ---------------------------------------------------------------------------
# Reset
# ---------------------------------------------------------------------------


def test_reset_clears_user_names() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    ns.exec("x = 99")
    assert "x" in ns.globals
    ns.reset()
    assert "x" not in ns.globals


def test_reset_restores_pre_imports() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    # Overwrite a pre-import name
    ns.exec("np = None")
    ns.reset()
    assert ns.globals.get("np") is not None
    import numpy

    assert ns.globals["np"] is numpy


def test_reset_clears_all_user_names_but_keeps_pre_imports() -> None:
    Namespace = _import_namespace()
    ns = Namespace()
    ns.exec("a = 1; b = 2; c = 3")
    ns.reset()
    for name in ("a", "b", "c"):
        assert name not in ns.globals
    assert "np" in ns.globals
    assert "plt" in ns.globals
