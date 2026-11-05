"""Physical-network DAE lowering pass (BE-38).

Assembles a :class:`DAESystem` from an :class:`IR1Graph` for a given physical
domain (``physical-translational``, ``physical-rotational``,
``physical-thermal``).

Algorithm
---------
1. Filter blocks / connections to the requested domain.
2. Build a node map (union-find over port connections).
3. Locate the reference node (world / absolute reference block) and its
   pinned across value.  Raise :exc:`NoReferenceError` if absent.
4. Collect state variables from inertia-like and spring-like blocks.
5. Assemble the mass matrix **M** and the right-hand-side callable ``rhs``
   such that ``M @ dx/dt = rhs(t, x)``.
6. Return a :class:`DAESystem`.

The dispatcher :func:`lower_all_physical_networks` iterates over all
physical domains present in the graph and returns a ``dict[domain, DAESystem]``
ready for the cross-domain coupler (BE-39).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import numpy as np

from simulator.compiler.dae_system import DAESystem
from simulator.ir.ir1 import IR1Block, IR1Graph

# ---------------------------------------------------------------------------
# Public exceptions
# ---------------------------------------------------------------------------


class NoReferenceError(ValueError):
    """Raised when a physical sub-network has no reference (ground) block."""


# ---------------------------------------------------------------------------
# Block-type behaviour table
# ---------------------------------------------------------------------------
# Each entry describes how the lowering pass treats a block:
#   kind          - assembler role (see _assemble_system)
#   state_var     - name of the primary state variable (if any)
#   coeff_key     - parameter key carrying the primary coefficient
#   ic_key        - key to look up initial condition in block.ic / block.params
#   ic_param_keys - fallback param keys for the IC (tried in order)
#   port          - which port name is "primary" (used for reference blocks)
#   value_param   - param key for the pinned across value (reference/source)
#   default_value - default for the pinned across value

_BLOCK_META: dict[str, dict[str, Any]] = {
    # ------------------------------------------------------------------
    # Translational
    # ------------------------------------------------------------------
    "physical-translational.element.mass": {
        "kind": "inertia_mass",
        "state_var": "v",
        "coeff_key": "m",
        "ic_key": "v",
        "ic_param_keys": ["v0"],
    },
    "physical-translational.element.spring": {
        "kind": "spring",
        "state_var": "x",
        "coeff_key": "k",
        "ic_key": "x",
        "ic_param_keys": ["x0"],
    },
    "physical-translational.element.damper": {
        "kind": "damper",
        "coeff_key": "c",
    },
    "physical-translational.source.force": {
        "kind": "through_source",
        "value_param": "F",
    },
    "physical-translational.source.velocity": {
        "kind": "across_source",
        "value_param": "v",
    },
    "physical-translational.reference.world": {
        "kind": "reference",
        "port": "p",
        "value_param": None,
        "default_value": 0.0,
    },
    # ------------------------------------------------------------------
    # Rotational
    # ------------------------------------------------------------------
    "physical-rotational.element.inertia": {
        "kind": "inertia_mass",
        "state_var": "omega",
        "coeff_key": "J",
        "ic_key": "omega",
        "ic_param_keys": ["omega0", "x0"],
    },
    "physical-rotational.element.spring": {
        "kind": "spring",
        "state_var": "theta",
        "coeff_key": "k",
        "ic_key": "theta",
        "ic_param_keys": ["theta0", "x0"],
    },
    "physical-rotational.element.damper": {
        "kind": "damper",
        "coeff_key": "c",
    },
    "physical-rotational.source.torque": {
        "kind": "through_source",
        "value_param": "T",
    },
    "physical-rotational.source.angular_velocity": {
        "kind": "across_source",
        "value_param": "w",
    },
    "physical-rotational.reference.world": {
        "kind": "reference",
        "port": "p",
        "value_param": None,
        "default_value": 0.0,
    },
    # ------------------------------------------------------------------
    # Thermal
    # ------------------------------------------------------------------
    "physical-thermal.element.mass": {
        "kind": "inertia_mass",
        "state_var": "T",
        "coeff_key": "C",
        "ic_key": "T",
        "ic_param_keys": ["T0", "x0"],
    },
    "physical-thermal.element.conductor": {
        "kind": "conductance",
        "coeff_key": "G",
    },
    "physical-thermal.source.heat_flow": {
        "kind": "through_source",
        "value_param": "Q",
    },
    "physical-thermal.source.temperature": {
        "kind": "across_source",
        "value_param": "T",
    },
    "physical-thermal.reference.absolute": {
        "kind": "reference",
        "port": "p",
        "value_param": "T",
        "default_value": 293.15,
    },
}

# ---------------------------------------------------------------------------
# Union-find helpers
# ---------------------------------------------------------------------------

_Port = tuple[str, str]  # (block_instance_id, port_id)


def _build_node_map(
    domain_blocks: list[IR1Block],
    domain_conns: list[Any],
) -> tuple[int, dict[_Port, int]]:
    """Return (n_nodes, port_to_node) using union-find over port connections."""
    parent: dict[_Port, _Port] = {}

    def _find(p: _Port) -> _Port:
        if p not in parent:
            parent[p] = p
        if parent[p] != p:
            parent[p] = _find(parent[p])
        return parent[p]

    def _union(a: _Port, b: _Port) -> None:
        ra, rb = _find(a), _find(b)
        if ra != rb:
            parent[ra] = rb

    # Seed all known ports so isolated ports get their own nodes.
    for blk in domain_blocks:
        for pid in ("a", "b", "p"):
            _find((blk.instance_id, pid))

    # Merge nodes based on connections.
    for conn in domain_conns:
        _union(conn.src, conn.dst)

    # Assign compact integer node indices.
    root_to_idx: dict[_Port, int] = {}
    port_node: dict[_Port, int] = {}
    for port in list(parent.keys()):
        root = _find(port)
        if root not in root_to_idx:
            root_to_idx[root] = len(root_to_idx)
        port_node[port] = root_to_idx[root]

    return len(root_to_idx), port_node


# ---------------------------------------------------------------------------
# IC helper
# ---------------------------------------------------------------------------


def _get_ic(blk: IR1Block, meta: dict[str, Any]) -> float:
    """Look up the initial condition for a block's primary state variable."""
    ic_key: str = meta.get("ic_key", "x")
    # 1. Prefer explicit ic dict on the block.
    val = blk.ic.get(ic_key)
    if val is not None:
        return float(val)
    # 2. Fall back to param aliases.
    for pk in meta.get("ic_param_keys", []):
        if pk in blk.params:
            return float(blk.params[pk])
    # 3. Default zero.
    return 0.0


# ---------------------------------------------------------------------------
# Core assembler
# ---------------------------------------------------------------------------


def lower_physical_network(ir1: IR1Graph, domain: str) -> DAESystem:
    """Assemble a :class:`DAESystem` for *domain* from *ir1*.

    Parameters
    ----------
    ir1:
        The IR-1 graph (may contain blocks from multiple domains; only
        those matching *domain* are considered).
    domain:
        One of ``"physical-translational"``, ``"physical-rotational"``, or
        ``"physical-thermal"``.

    Raises
    ------
    NoReferenceError
        If no reference block (world / absolute) is present in the sub-network.
    """
    # ------------------------------------------------------------------
    # 1. Filter blocks / connections to the requested domain.
    # ------------------------------------------------------------------
    domain_blocks = [b for b in ir1.blocks if b.domain == domain]
    domain_ids = {b.instance_id for b in domain_blocks}
    domain_conns = [c for c in ir1.connections if c.src[0] in domain_ids and c.dst[0] in domain_ids]

    # ------------------------------------------------------------------
    # 2. Build node map.
    # ------------------------------------------------------------------
    _n_nodes, port_node = _build_node_map(domain_blocks, domain_conns)

    # ------------------------------------------------------------------
    # 3. Find reference nodes.
    #    ref_nodes: node_idx -> pinned across value
    # ------------------------------------------------------------------
    ref_nodes: dict[int, float] = {}
    for blk in domain_blocks:
        bmeta = _BLOCK_META.get(blk.block_type)
        if bmeta is None or bmeta["kind"] != "reference":
            continue
        port = bmeta.get("port", "p")
        node_idx = port_node.get((blk.instance_id, port))
        if node_idx is None:
            continue
        vp = bmeta.get("value_param")
        if vp is not None:
            val = float(blk.params.get(vp, bmeta.get("default_value", 0.0)))
        else:
            val = float(bmeta.get("default_value", 0.0))
        ref_nodes[node_idx] = val

    if not ref_nodes:
        raise NoReferenceError(
            f"No reference block found for domain '{domain}'. "
            f"Add a reference block (e.g. {domain}.reference.world) to ground the network."
        )

    # ------------------------------------------------------------------
    # 4. Collect state variables.
    #    state_vars     : list of "<block_id>_<var>" names
    #    x0             : initial conditions (float list)
    #    state_idx_map  : block_id -> [state_index, ...]
    # ------------------------------------------------------------------
    state_vars: list[str] = []
    x0: list[float] = []
    state_idx_map: dict[str, list[int]] = {}

    for blk in domain_blocks:
        bmeta = _BLOCK_META.get(blk.block_type)
        if bmeta is None:
            state_idx_map[blk.instance_id] = []
            continue
        kind = bmeta["kind"]
        if kind in ("inertia_mass", "spring"):
            sv = bmeta["state_var"]
            idx = len(state_vars)
            state_vars.append(f"{blk.instance_id}_{sv}")
            x0.append(_get_ic(blk, bmeta))
            state_idx_map[blk.instance_id] = [idx]
        else:
            state_idx_map[blk.instance_id] = []

    n = len(state_vars)
    mass_mat = np.zeros((n, n), dtype=float)

    # ------------------------------------------------------------------
    # 5a. Set mass-matrix diagonal for inertia_mass blocks.
    #     Register the "across at node_a" mapping.
    #     node_across: node_idx -> state_idx (the across variable at that node)
    # ------------------------------------------------------------------
    node_across: dict[int, int] = {}

    for blk in domain_blocks:
        bmeta = _BLOCK_META.get(blk.block_type)
        if bmeta is None or bmeta["kind"] != "inertia_mass":
            continue
        idxs = state_idx_map[blk.instance_id]
        if not idxs:
            continue
        si = idxs[0]
        coeff = float(blk.params.get(bmeta["coeff_key"], 1.0))
        mass_mat[si, si] = coeff
        node_a = port_node.get((blk.instance_id, "a"))
        if node_a is not None:
            node_across[node_a] = si

    # ------------------------------------------------------------------
    # 5b. Set mass-matrix diagonal for spring blocks (mass_mat[i,i] = 1).
    # ------------------------------------------------------------------
    for blk in domain_blocks:
        bmeta = _BLOCK_META.get(blk.block_type)
        if bmeta is None or bmeta["kind"] != "spring":
            continue
        idxs = state_idx_map[blk.instance_id]
        if not idxs:
            continue
        si = idxs[0]
        mass_mat[si, si] = 1.0

    # ------------------------------------------------------------------
    # 6. Build rhs terms.
    #    Each term is a callable (t, x) -> float to be accumulated into
    #    a specific row of the rhs vector.
    # ------------------------------------------------------------------
    rhs_terms: list[tuple[int, Callable[[float, np.ndarray], float]]] = []

    def _across_at(node_idx: int, x: np.ndarray) -> float:
        """Return the across value at *node_idx* from state vector or ref."""
        if node_idx in ref_nodes:
            return ref_nodes[node_idx]
        si = node_across.get(node_idx)
        if si is not None:
            return float(x[si])
        return 0.0

    for blk in domain_blocks:
        bmeta = _BLOCK_META.get(blk.block_type)
        if bmeta is None:
            continue
        kind = bmeta["kind"]
        node_a = port_node.get((blk.instance_id, "a"))
        node_b = port_node.get((blk.instance_id, "b"))

        if kind == "spring":
            # State equation: dx/dt = v_a - v_b
            # Contribution to the inertia_mass at node_a: force = -k * x_spring
            spring_idxs = state_idx_map[blk.instance_id]
            if not spring_idxs:
                continue
            spring_si = spring_idxs[0]
            coeff = float(blk.params.get(bmeta["coeff_key"], 1.0))

            # Spring state row: rhs[spring_si] = across_a - across_b
            na, nb = node_a, node_b
            rhs_terms.append(
                (
                    spring_si,
                    lambda t, x, na=na, nb=nb: (  # type: ignore[misc]
                        _across_at(na, x) - _across_at(nb, x)
                    ),
                )
            )

            # Spring force contribution to KCL at node_a (inertia's equation row):
            # force INTO node_a from spring at port_a = -(k * x_spring)
            if na is not None:
                inertia_row = node_across.get(na)
                if inertia_row is not None:
                    rhs_terms.append(
                        (
                            inertia_row,
                            lambda t, x, k=coeff, ssi=spring_si: -k * x[ssi],  # type: ignore[misc]
                        )
                    )

        elif kind in ("damper", "conductance"):
            # Force at node_a: -coeff * (across_a - across_b)
            coeff = float(blk.params.get(bmeta["coeff_key"], 1.0))
            if node_a is not None:
                inertia_row = node_across.get(node_a)
                if inertia_row is not None:
                    na, nb = node_a, node_b
                    rhs_terms.append(
                        (
                            inertia_row,
                            lambda t, x, c=coeff, na=na, nb=nb: (  # type: ignore[misc]
                                -c * (_across_at(na, x) - _across_at(nb, x))
                            ),
                        )
                    )

        elif kind == "through_source":
            # Source drives +value into port_a node (source acts in b→a direction).
            vp = bmeta.get("value_param", "F")
            val = float(blk.params.get(vp, 0.0))
            if node_a is not None:
                inertia_row = node_across.get(node_a)
                if inertia_row is not None:
                    rhs_terms.append(
                        (
                            inertia_row,
                            lambda t, x, v=val: v,  # type: ignore[misc]
                        )
                    )

    # ------------------------------------------------------------------
    # 7. Build the rhs callable.
    # ------------------------------------------------------------------
    _captured_terms = list(rhs_terms)

    def rhs(t: float, x: np.ndarray) -> np.ndarray:
        result = np.zeros(n, dtype=float)
        for row, fn in _captured_terms:
            result[row] += fn(t, x)
        return result

    return DAESystem(
        domain=domain,
        state_vars=state_vars,
        x0=np.array(x0, dtype=float),
        mass_matrix=mass_mat,
        rhs=rhs,
        blocks=domain_blocks,
    )


# ---------------------------------------------------------------------------
# Dispatcher: lower all physical domains in one call
# ---------------------------------------------------------------------------

_KNOWN_PHYSICAL_DOMAINS = frozenset(
    {
        "physical-translational",
        "physical-rotational",
        "physical-thermal",
    }
)


def lower_all_physical_networks(ir1: IR1Graph) -> dict[str, DAESystem]:
    """Lower every physical domain present in *ir1* to a :class:`DAESystem`.

    Returns a ``dict`` mapping domain name to its assembled system.  Each
    domain is lowered independently; cross-domain coupling terms are supplied
    by BE-39 (converter lowering).

    Raises
    ------
    NoReferenceError
        If any domain's sub-network has no reference block.
    """
    # Collect domains that have at least one non-reference block.
    domains: set[str] = set()
    for blk in ir1.blocks:
        if blk.domain in _KNOWN_PHYSICAL_DOMAINS:
            bmeta = _BLOCK_META.get(blk.block_type)
            if bmeta is None or bmeta.get("kind") != "reference":
                domains.add(blk.domain)

    result: dict[str, DAESystem] = {}
    for domain in sorted(domains):
        result[domain] = lower_physical_network(ir1, domain)
    return result
