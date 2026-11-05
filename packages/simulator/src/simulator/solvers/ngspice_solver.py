"""ngspice subprocess backend for the classic SPICE path."""

from __future__ import annotations

import logging
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
from typing import Any, ClassVar

from simulator.compiler.spice_netlist_writer import is_circuit_block
from simulator.parsers.spice import parse_ngspice_raw
from simulator.parsers.spice.ngspice_raw_tail import NgspiceRawTailer
from simulator.solvers._subprocess_run import default_solver_timeout_seconds, run_cancellable
from simulator.solvers.path_discovery import SolverNotFoundError, find_solver
from simulator.solvers.protocol import (
    CancelToken,
    PartialCallback,
    ResultBundle,
    SimulationError,
    SolverOptions,
)
from simulator.solvers.xspice_bootstrap import XSpiceNotAvailableError, ensure_xspice_env

logger = logging.getLogger(__name__)

# Matches an entire .control ... .endc block, case-insensitively, however
# many lines it spans.
_CONTROL_BLOCK_RE = re.compile(
    r"^[ \t]*\.control\b.*?^[ \t]*\.endc\b.*?$",
    re.IGNORECASE | re.MULTILINE | re.DOTALL,
)

# XSPICE code-model instance cards (A-devices, e.g. "Aint 2 3 myint") are the
# only element type that needs codemodels loaded — plain B/E/G-source
# behavioral elements are core ngspice and never need this.
_XSPICE_ADEVICE_RE = re.compile(r"^[ \t]*A\S+\s", re.IGNORECASE | re.MULTILINE)


def _netlist_uses_xspice_codemodels(netlist: str) -> bool:
    return bool(_XSPICE_ADEVICE_RE.search(netlist))


def _strip_control_blocks(netlist: str) -> str:
    """Remove any embedded ``.control``/``.endc`` scripting block from *netlist*.

    ngspice batch mode (``-b``) executes a deck's own ``.control`` block,
    including any explicit ``write <path>`` command inside it — which writes
    to that literal (often relative, working-directory-dependent) path
    instead of the ``-r <resolved_raw_path>`` this solver passes on the
    command line to locate its output. Real-world netlists authored for
    interactive/manual ngspice runs commonly include such a block (with a
    ``run`` + ``write`` pair), which otherwise silently causes this solver
    to look for its raw file in the wrong place and fail with a confusing
    "file not found" error. Since ``-b -r`` already performs the equivalent
    run-and-write automatically, stripping the deck's own control script is
    safe and makes any such netlist "just work" through this solver
    regardless of what scripting the original author wrote for a different
    invocation style.
    """
    return _CONTROL_BLOCK_RE.sub("", netlist)


def discover_ngspice() -> pathlib.Path | None:
    try:
        return find_solver("ngspice")
    except SolverNotFoundError:
        candidates: list[pathlib.Path] = []
        which_result = shutil.which("ngspice")
        if which_result:
            candidates.append(pathlib.Path(which_result))
        candidates.extend(
            pathlib.Path(path)
            for path in ("/usr/bin/ngspice", "/usr/local/bin/ngspice")
            if pathlib.Path(path) not in candidates
        )

        for candidate in candidates:
            if not candidate.exists() or not os.access(candidate, os.X_OK):
                continue
            try:
                result = subprocess.run(
                    [str(candidate), "--version"],
                    capture_output=True,
                    timeout=5,
                )
            except OSError:
                continue
            if result.returncode == 0:
                return candidate
        return None


class NgspiceSolver:
    name = "ngspice"
    capabilities: ClassVar[set[str]] = {"transient", "ac", "dc", "dc_op", "noise", "tf", "pz"}

    def __init__(self, ngspice_path: pathlib.Path) -> None:
        self.ngspice_path = ngspice_path

    @classmethod
    def from_discovery(cls) -> NgspiceSolver | None:
        path = discover_ngspice()
        return None if path is None else cls(path)

    def can_handle(self, ir1: Any, intent: str) -> bool:
        blocks = getattr(ir1, "blocks", [])
        return any(is_circuit_block(block.block_type) for block in blocks)

    def solve(
        self,
        netlist: str,
        *,
        sim_id: str,
        options: SolverOptions | None = None,
        raw_output_path: pathlib.Path | None = None,
        cancel: CancelToken | None = None,
        on_partial: PartialCallback | None = None,
    ) -> ResultBundle:
        if cancel is not None and cancel.is_cancelled:
            raise SimulationError("Simulation cancelled before ngspice launch.")

        options = options or SolverOptions()
        timeout_seconds = default_solver_timeout_seconds(options.analysis_type, options.t_end)

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = pathlib.Path(tmpdir)
            cir_path = tmp_path / f"{sim_id}.cir"
            resolved_raw_path = raw_output_path or (tmp_path / f"{sim_id}.raw")
            cir_path.write_text(_strip_control_blocks(netlist), encoding="utf-8")

            cmd = [
                str(self.ngspice_path),
                "-b",
                "-r",
                str(resolved_raw_path),
                "-a",
                str(cir_path),
            ]
            logger.debug("ngspice cmd: %s", " ".join(cmd))
            logger.debug("ngspice netlist (%d chars):\n%s", len(netlist), netlist)

            env = None
            if _netlist_uses_xspice_codemodels(netlist):
                try:
                    xspice_env = ensure_xspice_env(self.ngspice_path)
                except XSpiceNotAvailableError as exc:
                    raise SimulationError(str(exc)) from exc
                env = {**os.environ, **xspice_env}

            on_poll = None
            if on_partial is not None:
                tailer = NgspiceRawTailer(resolved_raw_path)

                def on_poll() -> None:
                    partial = tailer.poll()
                    if partial is not None:
                        on_partial(partial)

            result = run_cancellable(
                cmd, timeout=timeout_seconds, cancel=cancel, on_poll=on_poll, env=env
            )
            if on_poll is not None:
                # ngspice may write its final points between the last poll
                # and process exit — one more poll after the subprocess has
                # already finished closes that gap so live streaming doesn't
                # silently drop the tail of the run.
                on_poll()

            stdout_text = result.stdout.decode("utf-8", errors="replace")
            stderr_text = result.stderr.decode("utf-8", errors="replace")
            logger.debug("ngspice exit code: %d", result.returncode)
            if stdout_text.strip():
                logger.debug("ngspice stdout:\n%s", stdout_text[:2000])
            if stderr_text.strip():
                logger.debug("ngspice stderr:\n%s", stderr_text[:2000])

            if result.returncode != 0:
                raise SimulationError(stderr_text or "ngspice exited with a non-zero status.")

            logger.debug(
                "ngspice raw output: %s (%d bytes)",
                resolved_raw_path,
                resolved_raw_path.stat().st_size if resolved_raw_path.exists() else 0,
            )
            return parse_ngspice_raw(resolved_raw_path, sim_id, analysis_type=options.analysis_type)
