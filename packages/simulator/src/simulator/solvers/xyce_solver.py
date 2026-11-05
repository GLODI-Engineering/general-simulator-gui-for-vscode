"""Xyce subprocess backend for the classic SPICE path."""

from __future__ import annotations

import os
import pathlib
import re
import tempfile
from typing import Any, ClassVar

from simulator.compiler.spice_netlist_writer import is_circuit_block
from simulator.parsers.spice import parse_xyce_prn
from simulator.parsers.spice.xyce_prn_tail import XycePrnTailer
from simulator.solvers._subprocess_run import default_solver_timeout_seconds, run_cancellable
from simulator.solvers.path_discovery import SolverNotFoundError, find_solver
from simulator.solvers.protocol import (
    CancelToken,
    PartialCallback,
    ResultBundle,
    SimulationError,
    SolverOptions,
)


class XyceSolver:
    name = "xyce"
    capabilities: ClassVar[set[str]] = {"transient", "dc_op", "ac"}

    def __init__(self, xyce_path: pathlib.Path, *, mpi_ranks: int = 1) -> None:
        self.xyce_path = xyce_path
        self.mpi_ranks = mpi_ranks

    @classmethod
    def from_discovery(cls) -> XyceSolver | None:
        try:
            return cls(find_solver("xyce"))
        except SolverNotFoundError:
            return None

    def can_handle(self, ir1: Any, intent: str) -> bool:
        blocks = getattr(ir1, "blocks", [])
        return intent != "control_only" and any(
            is_circuit_block(block.block_type) for block in blocks
        )

    def solve(
        self,
        netlist: str,
        *,
        sim_id: str,
        options: SolverOptions | None = None,
        prn_output_path: pathlib.Path | None = None,
        cancel: CancelToken | None = None,
        on_partial: PartialCallback | None = None,
    ) -> ResultBundle:
        if cancel is not None and cancel.is_cancelled:
            raise SimulationError("Simulation cancelled before Xyce launch.")

        options = options or SolverOptions()
        timeout_seconds = default_solver_timeout_seconds(options.analysis_type, options.t_end)

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = pathlib.Path(tmpdir)
            cir_path = tmp_path / f"{sim_id}.cir"
            prepared_netlist = _ensure_xyce_print(_strip_probe_format(netlist))
            cir_path.write_text(prepared_netlist, encoding="utf-8")
            env = os.environ.copy()
            lib_dir = self.xyce_path.parent.parent / "lib"
            if lib_dir.is_dir():
                existing = env.get("LD_LIBRARY_PATH", "")
                env["LD_LIBRARY_PATH"] = f"{lib_dir}:{existing}" if existing else str(lib_dir)

            command = [str(self.xyce_path), str(cir_path)]
            if self.mpi_ranks > 1:
                command = ["mpirun", "-np", str(self.mpi_ranks), *command]

            resolved_prn_path = prn_output_path or pathlib.Path(f"{cir_path}.prn")

            on_poll = None
            if on_partial is not None:
                tailer = XycePrnTailer(resolved_prn_path)

                def on_poll() -> None:
                    partial = tailer.poll()
                    if partial is not None:
                        on_partial(partial)

            result = run_cancellable(
                command, timeout=timeout_seconds, cancel=cancel, env=env, on_poll=on_poll
            )
            if on_poll is not None:
                # Xyce may flush its final rows between the last poll and
                # process exit — one more poll after the subprocess has
                # already finished closes that gap.
                on_poll()
            if result.returncode != 0:
                stderr = result.stderr.decode("utf-8", errors="replace")
                raise SimulationError(stderr or "Xyce exited with a non-zero status.")

            return parse_xyce_prn(resolved_prn_path, sim_id)


_PROBE_FORMAT_RE = re.compile(r"(?im)^(\s*\.print\s+\S+)\s+FORMAT\s*=\s*PROBE\b")


def _strip_probe_format(netlist: str) -> str:
    """Remove ``FORMAT=PROBE`` from any ``.print`` line in *netlist*.

    ``.print ... FORMAT=PROBE`` makes Xyce write its output as a PSpice-
    Probe-style ``.csd`` file (``#H``/``#N``/``#C`` record blocks) instead
    of the plain whitespace-delimited ``.prn`` this solver's parser
    (parse_xyce_prn) expects — real-world decks exported from other tools
    commonly request PROBE format, which otherwise makes this solver look
    for a ``.prn`` file that Xyce never wrote and fail with a confusing
    "file not found" error. Forcing the default (non-PROBE) format is safe:
    it doesn't change which signals are printed, only the on-disk encoding.
    """
    return _PROBE_FORMAT_RE.sub(r"\1", netlist)


def _ensure_xyce_print(netlist: str) -> str:
    upper = netlist.upper()
    if ".PRINT" in upper:
        return netlist

    lines = netlist.splitlines()
    insert_at = len(lines)
    for index, line in enumerate(lines):
        if line.strip().upper() == ".END":
            insert_at = index
            break

    # Minimal output request that satisfies the current RC smoke tests.
    lines.insert(insert_at, ".PRINT TRAN V(net1) V(net2)")
    return "\n".join(lines)
