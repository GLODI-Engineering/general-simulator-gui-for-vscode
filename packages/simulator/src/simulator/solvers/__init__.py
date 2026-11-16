"""Solver backends.

One backend: `general-simulator`. The registry that stood here returned a
SciPy backend, and `select_backend` chose between SciPy, ngspice and Xyce;
all three are gone, along with the second block taxonomy they needed.
"""

from __future__ import annotations

from typing import Any


def get_registry() -> list[Any]:
    """Return all registered solver backends."""
    from simulator.solvers.general_simulator_solver import GeneralSimulatorSolver

    backend = GeneralSimulatorSolver.from_discovery()
    return [backend] if backend is not None else []
