from __future__ import annotations

from typing import Any


def get_registry() -> list[Any]:
    """Return all registered solver backends."""
    from simulator.solvers.scipy_solver import SCIPY_BACKEND

    return [SCIPY_BACKEND]
