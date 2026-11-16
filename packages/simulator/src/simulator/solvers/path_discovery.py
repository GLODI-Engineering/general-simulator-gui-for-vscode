"""External-solver path discovery (BE-22).

Implements the resolution chain from backend-spec.md §11:
  1. Explicit option
  2. App settings file
  3. Environment variable GENSIM_<NAME>_PATH
  4. PATH lookup via shutil.which
  5. Not found → SolverNotFoundError
"""

from __future__ import annotations

import os
import pathlib
import shutil
from typing import Any


class SolverNotFoundError(Exception):
    """Raised when a solver binary cannot be located."""

    def __init__(self, solver_name: str, sources_searched: list[str]) -> None:
        self.solver_name = solver_name
        self.sources_searched = sources_searched
        env_var = _env_var_names(solver_name)[0]
        msg = (
            f"Solver {solver_name!r} not found. Searched:\n"
            + "\n".join(f"  {s}" for s in sources_searched)
            + f"\nSet {env_var} or configure the path in settings.json."
        )
        super().__init__(msg)


def _env_var_names(solver_name: str) -> list[str]:
    """Environment variables that may name this solver's binary, best first.

    `general-simulator` becomes `GENSIM_GENERAL_SIMULATOR_PATH`, not
    `GENSIM_GENERAL-SIMULATOR_PATH`: a hyphen cannot appear in a shell
    identifier. The hyphenated form is kept as a fallback so nothing that
    already sets it programmatically breaks.
    """
    upper = solver_name.upper()
    names = [f"GENSIM_{upper.replace('-', '_')}_PATH"]
    hyphenated = f"GENSIM_{upper}_PATH"
    if hyphenated != names[0]:
        names.append(hyphenated)
    return names


def candidate_names(solver_name: str) -> list[str]:
    """The filenames this solver's binary may have, best first.

    On Windows the released `general-simulator` archive contains
    `general-simulator.exe`, so a lookup for the bare name finds nothing. `shutil.which`
    applies PATHEXT for us, but a *directory* walk does not, so the suffix has to be
    spelled out wherever a path is built by hand.
    """
    if os.name == "nt":
        return [f"{solver_name}.exe", solver_name]
    return [solver_name]


def _validate_executable(path: pathlib.Path, version_regex: str | None = None) -> bool:
    """Return True if `path` is a runnable solver binary.

    It deliberately does **not** require `--version` to succeed.
    `general-simulator` has no such flag -- it treats any argument as a netlist path, so
    `general-simulator --version` exits 1 with
    `error: reading --version: No such file or directory`. Gating on that rejected every
    perfectly good binary, and because `discover_general_simulator` falls back to a
    sibling-checkout path afterwards, the breakage was invisible to anyone whose repos sit
    side by side and total for everyone else: on Windows both paths failed, so the
    extension could not find a solver at all.

    What is checked is what can be checked without assuming a CLI contract: the path
    exists, is a file, and on POSIX carries the execute bit. `os.access(X_OK)` is
    meaningless on Windows -- it reports success for any readable file -- so it is skipped
    there rather than relied on.

    `version_regex` is accepted for callers that still pass it and is not used; no solver
    reaching this function today publishes a version string in a documented shape.
    """
    if not path.is_file():
        return False
    # `os.access(X_OK)` is meaningless on Windows -- it reports success for any readable
    # file -- so the execute bit is only consulted where it means something.
    return os.name == "nt" or os.access(path, os.X_OK)


def find_solver(
    solver_name: str,
    explicit_path: pathlib.Path | str | None = None,
    settings: Any = None,
    settings_path: pathlib.Path | str | None = None,
) -> pathlib.Path:
    """Find the solver binary using the resolution chain.

    Args:
        solver_name: Lowercase name, e.g. "xyce".
        explicit_path: Highest-priority override (from simulate request).
        settings: Settings instance (kernel_sidecar.config.settings.Settings).
        settings_path: Path to a settings JSON file; read if settings is None.

    Returns:
        Validated path to the solver binary.

    Raises:
        SolverNotFoundError: If the binary cannot be found or validated.
    """
    import json

    sources_searched: list[str] = []

    # 1. Explicit option.
    if explicit_path is not None:
        p = pathlib.Path(explicit_path)
        sources_searched.append(f"explicit option: {p}")
        if _validate_executable(p):
            return p
    else:
        sources_searched.append("explicit option: not provided")

    # 2. App settings file / settings object.
    _settings = settings
    resolved_settings_path = pathlib.Path(settings_path) if settings_path is not None else None
    if _settings is None and resolved_settings_path is not None:
        sp = resolved_settings_path
        if sp.exists():
            try:
                with sp.open("r", encoding="utf-8") as f:
                    _settings = json.load(f)
            except Exception:
                pass

    if _settings is not None:
        # Support both a dict (parsed JSON) and a settings object.
        if isinstance(_settings, dict):
            val = (_settings.get("solvers") or {}).get(solver_name, {}).get("path")
        else:
            setting_key = f"solvers.{solver_name}.path"
            val = _settings.get(setting_key)
        if val:
            p = pathlib.Path(val)
            sources_searched.append(f"settings key solvers.{solver_name}.path: {p}")
            if _validate_executable(p):
                return p
        else:
            sources_searched.append(f"settings key solvers.{solver_name}.path: not configured")
    else:
        sources_searched.append("settings file: not provided")

    # 3. Environment variable.
    #
    # Both spellings, underscores first. The obvious construction —
    # f"GENSIM_{solver_name.upper()}_PATH" — gives `GENSIM_GENERAL-SIMULATOR_PATH`
    # for the one solver most people need to point at, and a hyphen is not a
    # valid shell identifier: `export GENSIM_GENERAL-SIMULATOR_PATH=...` is a
    # syntax error in bash and zsh. The variable can still be set
    # programmatically (the VS Code extension does exactly that when spawning
    # the sidecar), so the hyphenated form is still honoured for anything
    # already relying on it — but the form a person can actually type wins.
    for env_var in _env_var_names(solver_name):
        env_val = os.environ.get(env_var)
        if env_val:
            p = pathlib.Path(env_val)
            sources_searched.append(f"env var {env_var}: {p}")
            if _validate_executable(p):
                return p

    # 4. PATH lookup.
    which_result = shutil.which(solver_name)
    if which_result:
        p = pathlib.Path(which_result)
        sources_searched.append(f"PATH lookup: {p}")
        if _validate_executable(p):
            return p
    else:
        sources_searched.append(f"PATH lookup: {solver_name!r} not found in PATH")

    raise SolverNotFoundError(solver_name, sources_searched)
