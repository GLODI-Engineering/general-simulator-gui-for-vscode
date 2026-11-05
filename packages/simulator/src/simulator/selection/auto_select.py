"""Backend selection cascade for control and classic SPICE paths."""

from __future__ import annotations

import pathlib
from typing import Any

from simulator.compiler.spice_netlist_writer import is_circuit_block
from simulator.solvers.ngspice_solver import NgspiceSolver
from simulator.solvers.protocol import SimulationError
from simulator.solvers.scipy_solver import SCIPY_BACKEND
from simulator.solvers.xyce_solver import XyceSolver


def has_circuit_elements(ir2: Any) -> bool:
    return bool(getattr(ir2, "has_circuit_elements", False))


def select_backend(
    ir2: Any,
    intent: str = "transient_control",
    preferred_paths: dict[str, pathlib.Path] | None = None,
    solver: str | None = None,
) -> Any:
    """Return the appropriate solver backend for the given IR object."""
    requested_solver = solver.lower() if solver is not None else None
    blocks = getattr(ir2, "blocks", None)
    if blocks is not None and any(
        is_circuit_block(
            getattr(block, "block_type", getattr(getattr(block, "block", None), "block_type", ""))
        )
        for block in blocks
    ):
        if requested_solver == "scipy":
            raise SimulationError("SciPy cannot simulate circuit schematics. Use ngspice or Xyce.")
        if requested_solver == "xyce":
            if preferred_paths is not None and preferred_paths.get("xyce") is not None:
                return XyceSolver(preferred_paths["xyce"])
            xyce = XyceSolver.from_discovery()
            if xyce is not None:
                return xyce
            raise SimulationError("Requested solver 'xyce' is not available.")
        if requested_solver == "ngspice":
            if preferred_paths is not None and preferred_paths.get("ngspice") is not None:
                return NgspiceSolver(preferred_paths["ngspice"])
            ngspice = NgspiceSolver.from_discovery()
            if ngspice is not None:
                return ngspice
            raise SimulationError("Requested solver 'ngspice' is not available.")
        if requested_solver is not None:
            raise SimulationError(f"Unknown solver '{solver}'.")
        if preferred_paths is not None and preferred_paths.get("xyce") is not None:
            return XyceSolver(preferred_paths["xyce"])
        if preferred_paths is not None and preferred_paths.get("ngspice") is not None:
            return NgspiceSolver(preferred_paths["ngspice"])
        ngspice = NgspiceSolver.from_discovery()
        if ngspice is not None:
            return ngspice
        xyce = XyceSolver.from_discovery()
        if xyce is not None:
            return xyce
        raise SimulationError("No SPICE simulator found. Install ngspice or Xyce.")

    if requested_solver in {"ngspice", "xyce"}:
        raise SimulationError(
            f"Requested solver '{requested_solver}' requires a circuit schematic."
        )
    if requested_solver is not None and requested_solver != "scipy":
        raise SimulationError(f"Unknown solver '{solver}'.")
    if has_circuit_elements(ir2):
        raise NotImplementedError(
            "Circuit-level simulation requires Xyce, which is post-v1. "
            "Track in docs/specs/adaptive_simulation_backend_idea.md Phase 2."
        )
    return SCIPY_BACKEND
