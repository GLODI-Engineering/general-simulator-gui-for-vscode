"""`general-simulator` subprocess backend — the project's own native solver.

Half of the bypass-the-old-pipeline path described in
`simulator.compiler.gsim_py_netlist`'s own module doc comment: that module compiles a
`.gsim_sch` document straight to a netlist via `gsim-core`'s own compile registry; this module
runs that netlist through the real `general-simulator` binary (the Rust LCP/PWL engine — see
`general-simulator/README.md` for what it actually solves and why) and parses its CSV output
back into the same `ResultBundle` shape `NgspiceSolver`/`XyceSolver` already produce, so nothing
downstream of `solve()` (streaming, annotation, result writing) needs to know which solver ran.

Deliberately mirrors `NgspiceSolver` structurally (subprocess via `run_cancellable`, a
`from_discovery()` constructor, the same `solve(netlist, *, sim_id, options, ...)` signature) —
this is the fourth solver in this file's own family, not a new shape.

## One-time build step

```bash
cd <sibling-repos-root>/general-simulator
cargo build --release -p general-simulator-cli
```

The binary lands at `<general-simulator repo>/target/release/general-simulator`.
`discover_general_simulator()` checks that conventional sibling-repo location after the normal
`find_solver` resolution chain (explicit path / settings.json / `GENSIM_GENERAL_SIMULATOR_PATH`
/ `PATH`) comes up empty, the same way a developer running this workspace alongside its sibling
repos would expect it to "just work" without extra configuration — matching the path-dependency
convention `general-simulator`'s own `README.md` already documents for *its* sibling repos.
"""

from __future__ import annotations

import logging
import pathlib
import tempfile
from typing import Any, ClassVar

from simulator.parsers.general_simulator_csv import parse_general_simulator_csv
from simulator.solvers._subprocess_run import default_solver_timeout_seconds, run_cancellable
from simulator.solvers.path_discovery import SolverNotFoundError, find_solver
from simulator.solvers.protocol import (
    CancelToken,
    PartialCallback,
    ResultBundle,
    SimulationError,
    SolverOptions,
)

logger = logging.getLogger(__name__)

# Sibling-repo fallback location, relative to this repo's own root (four parents up from
# this file: solvers -> simulator -> src -> simulator package dir -> packages -> repo root
# is five; see discover_general_simulator's own resolution for the exact walk). Kept as a
# name, not a hardcoded absolute path, since the whole point is this "just works" for any
# developer who has the sibling repos checked out side by side, not just this machine.
_SIBLING_REPO_NAME = "general-simulator"
_SIBLING_BINARY_RELATIVE = pathlib.Path("target/release/general-simulator")


def discover_general_simulator() -> pathlib.Path | None:
    try:
        return find_solver("general-simulator")
    except SolverNotFoundError:
        pass

    # Fall back to the conventional sibling-repo build location: this repo's own root
    # (parents[5]: solvers -> simulator -> src -> simulator -> packages -> repo root),
    # one level up into the shared parent directory, then into a directory literally
    # named "general-simulator".
    this_repo_root = pathlib.Path(__file__).resolve().parents[5]
    candidate = this_repo_root.parent / _SIBLING_REPO_NAME / _SIBLING_BINARY_RELATIVE
    if candidate.exists() and candidate.is_file():
        return candidate
    return None


class GeneralSimulatorSolver:
    name = "general-simulator"
    capabilities: ClassVar[set[str]] = {"transient", "dc_op"}

    def __init__(self, binary_path: pathlib.Path) -> None:
        self.binary_path = binary_path

    @classmethod
    def from_discovery(cls) -> GeneralSimulatorSolver | None:
        path = discover_general_simulator()
        return None if path is None else cls(path)

    def can_handle(self, ir1: Any, intent: str) -> bool:
        # Every `general-simulator`-only catalogue document can be handled — there is no
        # separate "is this a circuit" check the way NgspiceSolver/XyceSolver need (SciPy
        # can't run a physical circuit; general-simulator's own continuous-blocks crate runs
        # a pure signal-flow diagram standalone too, so both shapes are always in scope).
        return True

    def solve(
        self,
        netlist: str,
        *,
        sim_id: str,
        options: SolverOptions | None = None,
        cancel: CancelToken | None = None,
        on_partial: PartialCallback | None = None,  # no live tailer yet
        cwd: pathlib.Path | None = None,
    ) -> ResultBundle:
        """`cwd`, when given, is where the `general-simulator` subprocess runs from — needed
        when the netlist contains a `kind=pyblock`/`cscript`/`octfunc` `path=` given relative
        to the document's own source directory (every script-authored `.gsim_sch` in this
        codebase does this), since the `.cir` file itself is always written into a fresh
        `tempfile.TemporaryDirectory()` that has no relation to that directory. The `.cir`
        file's own path on the command line is unaffected (still absolute, still in the temp
        dir) — only the subprocess's working directory changes, which is what a *relative*
        `path=` token resolves against.
        """
        if cancel is not None and cancel.is_cancelled:
            raise SimulationError("Simulation cancelled before general-simulator launch.")

        options = options or SolverOptions()
        analysis_type = options.analysis_type.upper()
        mode = "dc" if analysis_type in ("DC", "OP") else "transient"
        timeout_seconds = default_solver_timeout_seconds(options.analysis_type, options.t_end)

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = pathlib.Path(tmpdir)
            cir_path = tmp_path / f"{sim_id}.cir"
            cir_path.write_text(netlist, encoding="utf-8")

            cmd = [str(self.binary_path), str(cir_path), "--mode", mode]
            if mode == "transient":
                t_end = max(options.t_end - options.t_start, 0.0) or 1.0
                n_samples = max(options.n_samples, 2)
                # A fixed, deterministic step sized to the caller's own requested resolution
                # (n_samples) — matches this solver's documented "pick fixed-step or adaptive,
                # not both" contract (general-simulator's own cli-reference.md) by always
                # picking fixed-step, since SolverOptions has no dedicated "adaptive vs fixed"
                # flag of its own and a caller-controlled sample count is the more predictable
                # default for a UI-driven request than silently reaching for adaptive stepping.
                dt = t_end / n_samples
                cmd += ["--tfinal", repr(t_end), "--dt", repr(dt)]

            logger.debug("general-simulator cmd: %s", " ".join(cmd))
            logger.debug("general-simulator netlist (%d chars):\n%s", len(netlist), netlist)

            result = run_cancellable(
                cmd,
                timeout=timeout_seconds,
                cancel=cancel,
                cwd=str(cwd) if cwd is not None else None,
            )

            stdout_text = result.stdout.decode("utf-8", errors="replace")
            stderr_text = result.stderr.decode("utf-8", errors="replace")
            logger.debug("general-simulator exit code: %d", result.returncode)
            if stderr_text.strip():
                logger.debug("general-simulator stderr:\n%s", stderr_text[:2000])

            if result.returncode != 0:
                raise SimulationError(
                    stderr_text.strip() or "general-simulator exited with a non-zero status."
                )

            csv_path = tmp_path / f"{sim_id}.csv"
            csv_path.write_text(stdout_text, encoding="utf-8")
            return parse_general_simulator_csv(csv_path, sim_id)
