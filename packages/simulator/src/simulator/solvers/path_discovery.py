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
import subprocess
from typing import Any


class SolverNotFoundError(Exception):
    """Raised when a solver binary cannot be located."""

    def __init__(self, solver_name: str, sources_searched: list[str]) -> None:
        self.solver_name = solver_name
        self.sources_searched = sources_searched
        env_var = f"GENSIM_{solver_name.upper()}_PATH"
        msg = (
            f"Solver {solver_name!r} not found. Searched:\n"
            + "\n".join(f"  {s}" for s in sources_searched)
            + f"\nSet {env_var} or configure the path in settings.json."
        )
        super().__init__(msg)


def _validate_executable(path: pathlib.Path, version_regex: str | None = None) -> bool:
    """Return True if path exists, is executable, and --version succeeds."""
    if not path.exists():
        return False
    if not os.access(path, os.X_OK):
        return False
    env = os.environ.copy()
    lib_dir = path.parent.parent / "lib"
    if lib_dir.is_dir():
        existing = env.get("LD_LIBRARY_PATH", "")
        env["LD_LIBRARY_PATH"] = f"{lib_dir}:{existing}" if existing else str(lib_dir)
    version_flag = "-v" if path.name.lower() == "xyce" else "--version"
    try:
        result = subprocess.run(
            [str(path), version_flag],
            capture_output=True,
            timeout=5,
            env=env,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, OSError):
        return False


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
    env_var = f"GENSIM_{solver_name.upper()}_PATH"
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
