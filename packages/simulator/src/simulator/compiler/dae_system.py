"""DAESystem dataclass for physical-network lowering (BE-38)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class DAESystem:
    """A semi-explicit DAE/ODE system produced by the physical-network lowering pass.

    The system is expressed as::

        mass_matrix @ dx/dt = rhs(t, x)

    where *x* is the flat state vector, *mass_matrix* is a square numpy array,
    and *rhs* is a callable ``(float, np.ndarray) -> np.ndarray``.

    Attributes
    ----------
    domain:
        The physical domain this system was assembled for, e.g.
        ``"physical-translational"``.
    state_vars:
        Ordered list of state-variable names (``"<block_id>_<var>"``).
    x0:
        Initial state vector, shape ``(n_states,)``.
    mass_matrix:
        Square mass matrix M, shape ``(n_states, n_states)``.
    rhs:
        Callable ``rhs(t, x) -> np.ndarray`` returning the right-hand side of
        ``M @ dx/dt = rhs(t, x)``.
    blocks:
        The ``IR1Block`` instances that belong to this domain (used for
        cross-domain leakage checks in tests).
    """

    domain: str
    state_vars: list[str]
    x0: np.ndarray
    mass_matrix: np.ndarray
    rhs: Callable[[float, np.ndarray], np.ndarray]
    blocks: list[Any] = field(default_factory=list)

    @property
    def n_states(self) -> int:
        """Number of state variables."""
        return len(self.state_vars)

    def simulate(
        self,
        t_span: tuple[float, float],
        n_samples: int = 1000,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Integrate the system over *t_span* using ``scipy.integrate.solve_ivp``.

        Returns
        -------
        t : np.ndarray, shape (n_samples,)
        x : np.ndarray, shape (n_samples, n_states)
        """
        from scipy.integrate import solve_ivp

        mass = self.mass_matrix
        x0 = np.asarray(self.x0, dtype=float)

        def f(t: float, x: np.ndarray) -> np.ndarray:
            r = np.asarray(self.rhs(t, x), dtype=float)
            return np.linalg.solve(mass, r)

        t_eval = np.linspace(t_span[0], t_span[1], n_samples)
        sol = solve_ivp(
            f,
            t_span,
            x0,
            t_eval=t_eval,
            method="Radau",
            rtol=1e-7,
            atol=1e-9,
        )
        if not sol.success:
            raise RuntimeError(f"DAE simulation failed: {sol.message}")

        return sol.t, sol.y.T  # (n_samples,), (n_samples, n_states)
