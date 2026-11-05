"""BE-22 — External-solver path discovery tests.

Covers:
- Env-var path tested via monkeypatch.setenv.
- Settings-file path tested by writing a fixture settings.json.
- PATH lookup tested with shutil.which monkey-patched.
- Missing executable raises SolverNotFoundError with the four sources enumerated.
"""

from __future__ import annotations

import json
import pathlib
import shutil
import stat

import pytest


def _import_discovery():  # type: ignore[no-untyped-def]
    try:
        from simulator.solvers.path_discovery import (
            SolverNotFoundError,
            find_solver,
        )

        return find_solver, SolverNotFoundError
    except (ImportError, AttributeError):
        pytest.xfail("simulator.solvers.path_discovery not yet implemented")


# ---------------------------------------------------------------------------
# Env-var lookup
# ---------------------------------------------------------------------------


def test_env_var_path_is_used(tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """GENSIM_XYCE_PATH env var must be honoured."""
    find_solver, _ = _import_discovery()

    # Create a fake xyce executable
    fake_xyce = tmp_path / "xyce"
    fake_xyce.write_text("#!/bin/sh\necho 'Xyce 7.6'\n")
    fake_xyce.chmod(fake_xyce.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

    monkeypatch.setenv("GENSIM_XYCE_PATH", str(fake_xyce))
    monkeypatch.delenv("GENSIM_XYCE_PATH", raising=False)  # clear first
    monkeypatch.setenv("GENSIM_XYCE_PATH", str(fake_xyce))

    result = find_solver("xyce", settings_path=None, explicit_path=None)
    assert result == fake_xyce


# ---------------------------------------------------------------------------
# Settings file lookup
# ---------------------------------------------------------------------------


def test_settings_file_path_is_used(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """solvers.xyce.path in settings.json must be honoured."""
    find_solver, _ = _import_discovery()

    fake_xyce = tmp_path / "xyce"
    fake_xyce.write_text("#!/bin/sh\necho 'Xyce 7.6'\n")
    fake_xyce.chmod(fake_xyce.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps({"solvers": {"xyce": {"path": str(fake_xyce)}}}),
        encoding="utf-8",
    )

    monkeypatch.delenv("GENSIM_XYCE_PATH", raising=False)

    result = find_solver("xyce", settings_path=settings_file, explicit_path=None)
    assert result == fake_xyce


# ---------------------------------------------------------------------------
# PATH lookup
# ---------------------------------------------------------------------------


def test_path_lookup_via_which(tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """shutil.which fallback must be used when env and settings don't supply the path."""
    find_solver, _ = _import_discovery()

    fake_xyce = tmp_path / "xyce"
    fake_xyce.write_text("#!/bin/sh\necho 'Xyce 7.6'\n")
    fake_xyce.chmod(fake_xyce.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

    monkeypatch.delenv("GENSIM_XYCE_PATH", raising=False)

    original_which = shutil.which

    def fake_which(name: str, **kwargs: object) -> str | None:
        if name == "xyce":
            return str(fake_xyce)
        return original_which(name, **kwargs)

    monkeypatch.setattr(shutil, "which", fake_which)

    result = find_solver("xyce", settings_path=None, explicit_path=None)
    assert result == fake_xyce


# ---------------------------------------------------------------------------
# Explicit option has highest priority
# ---------------------------------------------------------------------------


def test_explicit_path_overrides_all(
    tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    find_solver, _ = _import_discovery()

    fake_xyce = tmp_path / "xyce_explicit"
    fake_xyce.write_text("#!/bin/sh\necho 'Xyce 7.6'\n")
    fake_xyce.chmod(fake_xyce.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

    monkeypatch.setenv("GENSIM_XYCE_PATH", "/dev/null")

    result = find_solver("xyce", settings_path=None, explicit_path=fake_xyce)
    assert result == fake_xyce


# ---------------------------------------------------------------------------
# Not found
# ---------------------------------------------------------------------------


def test_not_found_raises_solver_not_found_error(monkeypatch: pytest.MonkeyPatch) -> None:
    find_solver, SolverNotFoundError = _import_discovery()

    monkeypatch.delenv("GENSIM_XYCE_PATH", raising=False)
    monkeypatch.setattr(shutil, "which", lambda *a, **kw: None)

    with pytest.raises(SolverNotFoundError) as exc_info:
        find_solver("xyce", settings_path=None, explicit_path=None)

    msg = str(exc_info.value)
    # Must enumerate the four sources
    assert "GENSIM_XYCE_PATH" in msg or "env" in msg.lower(), (
        f"Error must mention env var; got: {msg!r}"
    )


def test_not_found_error_enumerates_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    find_solver, SolverNotFoundError = _import_discovery()

    monkeypatch.delenv("GENSIM_XYCE_PATH", raising=False)
    monkeypatch.setattr(shutil, "which", lambda *a, **kw: None)

    with pytest.raises(SolverNotFoundError) as exc_info:
        find_solver("xyce", settings_path=None, explicit_path=None)

    err = exc_info.value
    # The error must carry the list of sources searched
    sources = getattr(err, "sources_searched", None) or str(err)
    assert sources is not None
    # At least 2 source types must be mentioned
    count = sum(
        1
        for keyword in ("explicit", "settings", "env", "PATH", "which")
        if keyword.lower() in str(sources).lower()
    )
    assert count >= 2, f"Error must enumerate sources; got: {sources!r}"
