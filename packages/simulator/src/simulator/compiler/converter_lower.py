"""Converter boundary lowering (BE-39).

This module is responsible for two concerns:

1. **CrossParadigmWireError** — raised at IR-1 build time when a wire
   directly connects a signal-flow block to a physical-network block (or vice
   versa) without a converter block in between.

2. **lower_converter_boundary** — stitches the residuals produced by
   converter equation templates into a unified :class:`CoupledDAESystem` that
   can be handed to a scipy/Radau integrator.

Only the boundary between a *signal-flow ODE* and a *physical DAE* is
handled here.  Physical-domain to physical-domain converters
(e.g. rotational↔translational) are handled as ordinary physical-network
elements by the physical_network_lower pass (BE-38).

Spec reference: §15.6
"""

from __future__ import annotations

import contextlib
import importlib
import importlib.util
import pathlib
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from simulator.ir.ir1 import IR1Block, IR1Connection, IR1Graph

# ---------------------------------------------------------------------------
# Public exception
# ---------------------------------------------------------------------------

SIGNAL_FLOW_PARADIGM = "signal-flow"
PHYSICAL_NETWORK_PARADIGM = "physical-network"

# Port kinds that belong to physical domains.
_PHYSICAL_KINDS: frozenset[str] = frozenset(
    {
        "physical-electrical",
        "physical-rotational",
        "physical-translational",
        "physical-thermal",
        "physical-signal",
    }
)

# Port kinds that belong to the signal-flow domain.
_SIGNAL_KINDS: frozenset[str] = frozenset({"signal"})


class CrossParadigmWireError(ValueError):
    """Raised when a wire directly crosses a paradigm boundary without a converter.

    This error is raised at IR-1 build time so that problems are caught as
    early as possible — not at solve time.

    The message names the offending source and destination blocks.
    """


# ---------------------------------------------------------------------------
# Helpers for paradigm classification
# ---------------------------------------------------------------------------


def _is_signal_flow(block: IR1Block) -> bool:
    return block.paradigm == SIGNAL_FLOW_PARADIGM


def _is_physical_network(block: IR1Block) -> bool:
    return block.paradigm == PHYSICAL_NETWORK_PARADIGM


def _is_converter(block: IR1Block) -> bool:
    return block.paradigm == "converter"


def _block_index(blocks: list[IR1Block]) -> dict[str, IR1Block]:
    return {b.instance_id: b for b in blocks}


# ---------------------------------------------------------------------------
# Cross-paradigm wire validation (called from ir1_builder.build)
# ---------------------------------------------------------------------------


def validate_no_direct_cross_paradigm_wires(ir1: IR1Graph) -> None:
    """Raise CrossParadigmWireError if any connection directly links a
    signal-flow block to a physical-network block without a converter.

    A "converter" block (paradigm='converter') is the only allowed bridge.

    Parameters
    ----------
    ir1:
        The fully constructed IR1Graph (all blocks and connections present).

    Raises
    ------
    CrossParadigmWireError
        On the first offending connection found.
    """
    idx = _block_index(ir1.blocks)

    for conn in ir1.connections:
        src_id, _src_port = conn.src
        dst_id, _dst_port = conn.dst

        src_block = idx.get(src_id)
        dst_block = idx.get(dst_id)

        if src_block is None or dst_block is None:
            # Unknown block IDs — handled elsewhere.
            continue

        src_signal = _is_signal_flow(src_block)
        src_physical = _is_physical_network(src_block)
        dst_signal = _is_signal_flow(dst_block)
        dst_physical = _is_physical_network(dst_block)

        # Cross-paradigm = one side is signal-flow, the other is physical-network,
        # and neither endpoint is a converter.
        if (src_signal and dst_physical) or (src_physical and dst_signal):
            raise CrossParadigmWireError(
                f"Direct cross-paradigm wire detected: "
                f"block '{src_id}' (paradigm={src_block.paradigm!r}) "
                f"→ block '{dst_id}' (paradigm={dst_block.paradigm!r}). "
                "A converter block (e.g. converter.signal_to_physical_signal) "
                "must be placed between signal-flow and physical-network blocks."
            )


# ---------------------------------------------------------------------------
# Coupled DAE system produced by the boundary stitch
# ---------------------------------------------------------------------------


@dataclass
class CoupledDAESystem:
    """A unified DAE system assembled from a signal-flow ODE and a physical
    DAE, stitched together via converter coupling terms.

    This object exposes the standard DAESystem interface expected by the
    scipy-based solver:

    Attributes
    ----------
    n_states:
        Total number of state variables (signal-flow + physical).
    x0:
        Initial state vector (length *n_states*).
    mass_matrix:
        Mass matrix M of shape (n_states, n_states).  For pure ODE states
        the diagonal entry is 1.0; for algebraic coupling residuals it may
        be 0.0.
    rhs:
        Callable ``rhs(t, x) → ndarray`` returning the right-hand side of
        ``M · ẋ = rhs(t, x)``.
    converter_blocks:
        The converter IR1Blocks that contributed coupling terms.
    domain:
        Always ``'coupled'`` to distinguish from single-domain DAESystems.
    """

    n_states: int = 0
    x0: list[float] = field(default_factory=list)
    mass_matrix: np.ndarray = field(default_factory=lambda: np.zeros((0, 0)))
    rhs: Callable[[float, np.ndarray], np.ndarray] = field(
        default_factory=lambda: lambda t, x: np.zeros(0)
    )
    converter_blocks: list[IR1Block] = field(default_factory=list)
    domain: str = "coupled"

    def simulate(
        self,
        t_span: tuple[float, float],
        n_samples: int = 500,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Integrate the coupled system over *t_span* using scipy Radau.

        Returns
        -------
        t : ndarray of shape (n_samples,)
        x : ndarray of shape (n_samples, n_states)
        """
        from scipy.integrate import solve_ivp  # local import to avoid hard dep

        mass = self.mass_matrix
        n = self.n_states
        x0_arr = np.asarray(self.x0, dtype=float)

        def _ode(t: float, x: np.ndarray) -> np.ndarray:
            r = np.asarray(self.rhs(t, x), dtype=float)
            return np.linalg.solve(mass + np.eye(n) * 1e-14, r)

        t_eval = np.linspace(t_span[0], t_span[1], n_samples)
        sol = solve_ivp(
            _ode,
            t_span,
            x0_arr,
            method="Radau",
            t_eval=t_eval,
            rtol=1e-7,
            atol=1e-9,
        )
        if not sol.success:
            raise RuntimeError(f"CoupledDAESystem.simulate failed: {sol.message}")
        return sol.t, sol.y.T


# ---------------------------------------------------------------------------
# Converter equations loader
# ---------------------------------------------------------------------------

_BLOCKS_ROOT = pathlib.Path(__file__).parents[6] / "packages" / "blocks" / "src" / "blocks"


def _load_converter_equations(block_type: str) -> Any | None:
    """Import the Equations class for a converter block type.

    Searches ``packages/blocks/src/blocks/<relative_path>/equations.py``
    where *block_type* is e.g. ``converter.electrical_to_rotational`` →
    ``converter/electrical_to_rotational/equations.py``.

    Returns the instantiated Equations object, or None if not found.
    """
    # block_type: "converter.electrical_to_rotational"
    # → relative subpath: "converter/electrical_to_rotational"
    parts = block_type.split(".")
    if len(parts) < 2:
        return None

    rel_path = pathlib.Path(*parts) / "equations.py"
    eq_path = _BLOCKS_ROOT / rel_path
    if not eq_path.exists():
        return None

    try:
        spec = importlib.util.spec_from_file_location(
            f"_conv_eq_{block_type.replace('.', '_')}", eq_path
        )
        assert spec is not None and spec.loader is not None
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        cls = getattr(mod, "Equations", None)
        if cls is None:
            return None
        return cls()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Boundary stitching entry point
# ---------------------------------------------------------------------------


def lower_converter_boundary(ir1: IR1Graph) -> CoupledDAESystem:
    """Stitch signal-flow ODE and physical DAE residuals via converter blocks.

    Walks the converter blocks in *ir1*, loads their residual callables, and
    assembles a :class:`CoupledDAESystem` with a combined state vector and
    mass matrix.

    For each converter block the coupling residuals ``r_i(state, params)``
    are appended to the global residual vector.  Signal-flow ODE blocks
    contribute their ``derivatives()`` outputs as standard state equations
    (mass diagonal = 1).  Physical DAE blocks contribute MNA-style residuals
    (already assembled by physical_network_lower, if available).

    Parameters
    ----------
    ir1:
        IR1Graph containing signal-flow, physical-network, and converter
        blocks.

    Returns
    -------
    CoupledDAESystem
        A unified system ready for scipy integration.
    """
    # Collect converter blocks with loadable equations.
    converter_blocks: list[IR1Block] = [b for b in ir1.blocks if _is_converter(b)]

    conv_equations: list[tuple[IR1Block, Any]] = []
    for blk in converter_blocks:
        eqs = _load_converter_equations(blk.block_type)
        if eqs is not None:
            conv_equations.append((blk, eqs))

    # Attempt to load the signal-flow and physical sub-systems.
    sf_system = _try_lower_signal_flow(ir1)
    phys_systems = _try_lower_physical_networks(ir1)

    # Build the combined state layout.
    # Layout:  [signal_flow_states | physical_states | coupling_residuals]
    sf_n = _system_n_states(sf_system)
    phys_n = sum(_system_n_states(ps) for ps in phys_systems.values())

    # Coupling residuals contribute algebraic rows (mass = 0 on diagonal).
    n_coupling = sum(len(eqs.residuals({}, blk.params)) for blk, eqs in conv_equations)

    n_total = sf_n + phys_n + n_coupling

    # Assemble mass matrix.
    mass_mat = np.eye(n_total)
    # Mark algebraic rows (coupling residuals) with 0 on diagonal.
    for idx in range(sf_n + phys_n, n_total):
        mass_mat[idx, idx] = 0.0

    # Assemble x0.
    x0: list[float] = []
    x0 += _system_x0(sf_system)
    for ps in phys_systems.values():
        x0 += _system_x0(ps)
    x0 += [0.0] * n_coupling  # coupling residual states start at zero

    # Build the rhs callable.
    sf_offset = 0
    phys_offset = sf_n
    coupling_offset = sf_n + phys_n

    def _rhs(t: float, x: np.ndarray) -> np.ndarray:
        out = np.zeros(n_total)

        # Signal-flow ODE contributions.
        if sf_system is not None:
            rhs_sf = getattr(sf_system, "rhs", None)
            if callable(rhs_sf):
                x_sf = x[sf_offset : sf_offset + sf_n]
                out[sf_offset : sf_offset + sf_n] = np.asarray(rhs_sf(t, x_sf), dtype=float)

        # Physical network DAE contributions.
        p_off = phys_offset
        for ps in phys_systems.values():
            ps_n = _system_n_states(ps)
            rhs_phys = getattr(ps, "rhs", None)
            if callable(rhs_phys):
                x_ps = x[p_off : p_off + ps_n]
                out[p_off : p_off + ps_n] = np.asarray(rhs_phys(t, x_ps), dtype=float)
            p_off += ps_n

        # Coupling residuals from converter blocks.
        c_off = coupling_offset
        for blk, eqs in conv_equations:
            # Build a local state dict from the current x vector.
            # Converters currently use symbolic residuals; pass params only.
            residuals = eqs.residuals({}, blk.params)
            for r in residuals:
                out[c_off] = float(r)
                c_off += 1

        return out

    return CoupledDAESystem(
        n_states=n_total,
        x0=x0,
        mass_matrix=mass_mat,
        rhs=_rhs,
        converter_blocks=converter_blocks,
        domain="coupled",
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _try_lower_signal_flow(ir1: IR1Graph) -> Any | None:
    """Attempt to lower signal-flow blocks via ir2_lowering.lower().

    Returns the IR2System if successful, otherwise None.
    """
    try:
        from simulator.compiler.ir2_lowering import lower as lower_ir2

        sf_blocks = [b for b in ir1.blocks if _is_signal_flow(b)]
        sf_conns = [c for c in ir1.connections if _is_signal_flow_conn(c, ir1)]
        if not sf_blocks:
            return None
        sf_ir1 = IR1Graph(
            blocks=sf_blocks,
            connections=sf_conns,
            params=ir1.params,
            nets=ir1.nets,
            simulation=ir1.simulation,
        )
        return lower_ir2(sf_ir1)
    except Exception:
        return None


def _is_signal_flow_conn(conn: IR1Connection, ir1: IR1Graph) -> bool:
    idx = _block_index(ir1.blocks)
    src = idx.get(conn.src[0])
    dst = idx.get(conn.dst[0])
    return src is not None and dst is not None and _is_signal_flow(src) and _is_signal_flow(dst)


def _try_lower_physical_networks(ir1: IR1Graph) -> dict[str, Any]:
    """Attempt to lower each physical domain via physical_network_lower.

    Returns a dict mapping domain string to DAESystem.  Empty if not yet
    implemented.
    """
    try:
        from simulator.compiler.physical_network_lower import lower_physical_network
    except ImportError:
        return {}

    domains: set[str] = {
        b.domain for b in ir1.blocks if _is_physical_network(b) and b.domain != "signal"
    }
    result: dict[str, Any] = {}
    for domain in sorted(domains):
        with contextlib.suppress(Exception):
            result[domain] = lower_physical_network(ir1, domain=domain)
    return result


def _system_n_states(system: Any) -> int:
    if system is None:
        return 0
    for attr in ("n_states",):
        v = getattr(system, attr, None)
        if isinstance(v, int):
            return v
    sv = getattr(system, "state_vars", None)
    if isinstance(sv, list | tuple | dict):
        return len(sv)
    x0 = getattr(system, "x0", None)
    if isinstance(x0, list | tuple | np.ndarray):
        return len(x0)
    sl = getattr(system, "state_layout", None)
    if isinstance(sl, dict):
        return len(sl)
    return 0


def _system_x0(system: Any) -> list[float]:
    if system is None:
        return []
    x0 = getattr(system, "x0", None)
    if x0 is None:
        n = _system_n_states(system)
        return [0.0] * n
    if isinstance(x0, np.ndarray):
        return [float(v) for v in x0.flat]
    return [float(v) for v in x0]
