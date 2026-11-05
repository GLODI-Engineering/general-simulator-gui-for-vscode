"""SPICE netlist writer — v1 (legacy) and v2 (IR-1 named-nets) paths.

Public API
----------
write_netlist(ir1, request)
    Accepts either a :class:`~simulator.solvers.protocol.AnalysisRequest`
    (v2 path — BE-36) or a :class:`~simulator.solvers.protocol.SolverOptions`
    (v1 / legacy path — BE-24).

is_circuit_block(block_type)
    Returns True when *block_type* belongs to a legacy circuit prefix.

is_circuit_schematic(ir1)
    Returns True when any block in *ir1* is a circuit block.

compute_node_domains(ir1)
    Returns a ``{spice_node_name: domain}`` map (e.g. "signal" vs
    "physical-electrical") — BE-63. ngspice prints both a real electrical
    node and a signal-flow-origin node identically as ``v(nodename)``; this
    lets result post-processing (BE-63) tag the latter as a unitless
    signal instead of mislabeling it "Volts" purely from that name prefix.
"""

from __future__ import annotations

import re
import warnings
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, overload

from simulator.compiler import signal_flow_spice_lower
from simulator.compiler.spice_card_emitters import (
    ElementSpec,
    UnsupportedBlockError,
    diode_model_override_params,
    get_spec_v2,
)
from simulator.ir.ir1 import IR1Block, IR1Graph, IR1Net, IR1SubcktDef
from simulator.solvers.protocol import AnalysisRequest, SolverOptions

_SUBCKT_INSTANCE_TYPE = "spice-subckt.instance"

# Writer targets. ``"spice"`` covers every backend that honours ``.IC``
# (ngspice, Xyce); ``"general-simulator"`` parses ``.IC`` and drops it
# (GLODI-Engineering/general-simulator#11), so node initial conditions are
# translated onto the capacitors attached to the net instead.
TARGET_SPICE = "spice"
TARGET_GENERAL_SIMULATOR = "general-simulator"
_KNOWN_TARGETS = frozenset({TARGET_SPICE, TARGET_GENERAL_SIMULATOR})

_CAPACITOR_TYPES = frozenset(
    {
        "physical-electrical.passive.capacitor",
        "passive.capacitor",
        "passive.capacitor.behavioral",
        "passive.capacitor.semiconductor",
    }
)

# Re-export UnsupportedBlockError so callers can import it from either module.
__all__ = [
    "TARGET_GENERAL_SIMULATOR",
    "TARGET_SPICE",
    "NodeICConflictError",
    "UnsupportedBlockError",
    "compute_node_domains",
    "is_circuit_block",
    "is_circuit_schematic",
    "write_netlist",
]


class NodeICConflictError(ValueError):
    """A node initial condition disagrees with the ``IC`` already set on a
    capacitor attached to that net, on a target where the node IC can only
    be expressed through the capacitor."""


# ---------------------------------------------------------------------------
# Legacy (v1) infrastructure — kept intact for BE-24 tests
# ---------------------------------------------------------------------------

_LegacyRenderer = Callable[[IR1Block, dict[str, str]], str]
_CIRCUIT_PREFIXES = ("passive.", "source.", "semi.", "tline.", "physical-electrical.")
_GROUND_LABELS = {"0", "GND"}


def is_circuit_block(block_type: str) -> bool:
    return any(block_type.startswith(prefix) for prefix in _CIRCUIT_PREFIXES)


def is_circuit_schematic(ir1: IR1Graph) -> bool:
    return any(is_circuit_block(block.block_type) for block in ir1.blocks)


@dataclass(frozen=True)
class _ElementSpec:
    prefix: str
    ports: tuple[str, ...]
    render: _LegacyRenderer


def _sanitize_instance_id(prefix: str, instance_id: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_]", "_", instance_id)
    cleaned = cleaned.lstrip("_") or "inst"
    return f"{prefix}{cleaned}"


def _param(block: IR1Block, name: str, default: str | float | int = "0") -> str:
    return str(block.params.get(name, default))


def _render_resistor_v1(block: IR1Block, nets: dict[str, str]) -> str:
    return (
        f"{_sanitize_instance_id('R', block.instance_id)}"
        f" {nets['p']} {nets['n']} {_param(block, 'R')}"
    )


def _render_capacitor_v1(block: IR1Block, nets: dict[str, str]) -> str:
    line = (
        f"{_sanitize_instance_id('C', block.instance_id)}"
        f" {nets['p']} {nets['n']} {_param(block, 'C')}"
    )
    if "IC" in block.params:
        line += f" IC={block.params['IC']}"
    return line


def _render_inductor_v1(block: IR1Block, nets: dict[str, str]) -> str:
    line = (
        f"{_sanitize_instance_id('L', block.instance_id)}"
        f" {nets['p']} {nets['n']} {_param(block, 'L', 1e-3)}"
    )
    if "IC" in block.params:
        line += f" IC={block.params['IC']}"
    return line


def _render_voltage_source_v1(block: IR1Block, nets: dict[str, str]) -> str:
    return (
        f"{_sanitize_instance_id('V', block.instance_id)}"
        f" {nets['p']} {nets['n']} DC {_param(block, 'V')}"
    )


BLOCK_TO_SPICE: dict[str, _ElementSpec] = {
    "passive.resistor": _ElementSpec("R", ("p", "n"), _render_resistor_v1),
    "passive.resistor.behavioral": _ElementSpec("R", ("p", "n"), _render_resistor_v1),
    "passive.resistor.semiconductor": _ElementSpec("R", ("p", "n"), _render_resistor_v1),
    "passive.capacitor": _ElementSpec("C", ("p", "n"), _render_capacitor_v1),
    "passive.capacitor.behavioral": _ElementSpec("C", ("p", "n"), _render_capacitor_v1),
    "passive.capacitor.semiconductor": _ElementSpec("C", ("p", "n"), _render_capacitor_v1),
    "passive.inductor": _ElementSpec("L", ("p", "n"), _render_inductor_v1),
    "passive.inductor.behavioral": _ElementSpec("L", ("p", "n"), _render_inductor_v1),
    "source.voltage.dc": _ElementSpec("V", ("p", "n"), _render_voltage_source_v1),
}


# ---------------------------------------------------------------------------
# Legacy (v1) net assignment — unchanged from BE-24
# ---------------------------------------------------------------------------


def _assign_nets(ir1: IR1Graph) -> dict[tuple[str, str], str]:
    parent: dict[tuple[str, str], tuple[str, str]] = {}

    def add(endpoint: tuple[str, str]) -> None:
        parent.setdefault(endpoint, endpoint)

    def find(endpoint: tuple[str, str]) -> tuple[str, str]:
        root = parent[endpoint]
        if root != endpoint:
            parent[endpoint] = find(root)
        return parent[endpoint]

    def union(left: tuple[str, str], right: tuple[str, str]) -> None:
        left_root = find(left)
        right_root = find(right)
        if left_root != right_root:
            parent[right_root] = left_root

    for block in ir1.blocks:
        spec = BLOCK_TO_SPICE.get(block.block_type)
        if spec is None:
            raise ValueError(f"Unknown block type {block.block_type!r}")
        for port_id in spec.ports:
            add((block.instance_id, port_id))

    for connection in ir1.connections:
        add(connection.src)
        add(connection.dst)
        union(connection.src, connection.dst)

    components: dict[tuple[str, str], list[tuple[str, str]]] = defaultdict(list)
    for endpoint in sorted(parent):
        components[find(endpoint)].append(endpoint)

    component_keys = sorted(components, key=lambda key: min(components[key]))
    ground_key = _select_ground_component(component_keys, components)

    net_names: dict[tuple[str, str], str] = {}
    next_index = 1
    for key in component_keys:
        name = "0" if key == ground_key else f"net{next_index}"
        if key != ground_key:
            next_index += 1
        for endpoint in components[key]:
            net_names[endpoint] = name
    return net_names


def _select_ground_component(
    component_keys: list[tuple[str, str]],
    components: dict[tuple[str, str], list[tuple[str, str]]],
) -> tuple[str, str]:
    labelled_grounds = []
    for key in component_keys:
        labels = {endpoint[1].upper() for endpoint in components[key]}
        if labels & _GROUND_LABELS:
            labelled_grounds.append(key)
    if labelled_grounds:
        return min(labelled_grounds, key=lambda key: min(components[key]))

    def score(key: tuple[str, str]) -> tuple[int, tuple[str, str]]:
        block_count = len({endpoint[0] for endpoint in components[key]})
        return (-block_count, min(components[key]))

    return min(component_keys, key=score)


def _analysis_line_v1(options: SolverOptions) -> str:
    analysis = options.analysis_type.upper()
    if analysis == "TRAN":
        step = options.t_end / max(options.n_samples, 1)
        uic_suffix = " UIC" if options.uic else ""
        return f".TRAN {step:g} {options.t_end:g}{uic_suffix}"
    if analysis == "AC":
        return f".AC DEC {options.ac_points} {options.ac_fstart:g} {options.ac_fstop:g}"
    if analysis == "DC":
        return (
            f".DC {options.dc_source} {options.dc_start:g} {options.dc_stop:g} {options.dc_step:g}"
        )
    if analysis == "OP":
        return ".OP"
    raise ValueError(f"Unsupported analysis_type {options.analysis_type!r}")


# ---------------------------------------------------------------------------
# v2 net assignment — uses IR1Connection.net and IR1Net.is_reference
# ---------------------------------------------------------------------------


def _assign_nets_v2(
    ir1: IR1Graph, def_by_id: dict[str, IR1SubcktDef] | None = None
) -> dict[tuple[str, str], str]:
    """Assign SPICE net names to every (block, port) endpoint.

    Rules (from BE-36 acceptance):
    * An endpoint connected via a named :class:`~simulator.ir.ir1.IR1Connection`
      (``connection.net`` is set) gets that name verbatim — *unless* the
      corresponding :class:`~simulator.ir.ir1.IR1Net` has
      ``is_reference=True``, in which case the net becomes ``"0"``.
    * Unnamed endpoints are auto-assigned ``net1``, ``net2``, … in
      deterministic order.
    """
    net_specs: dict[str, IR1Net] = {n.name: n for n in ir1.nets}

    parent: dict[tuple[str, str], tuple[str, str]] = {}

    def add(ep: tuple[str, str]) -> None:
        parent.setdefault(ep, ep)

    def find(ep: tuple[str, str]) -> tuple[str, str]:
        root = parent[ep]
        if root != ep:
            parent[ep] = find(root)
        return parent[ep]

    def union(a: tuple[str, str], b: tuple[str, str]) -> None:
        ar, br = find(a), find(b)
        if ar != br:
            parent[br] = ar

    # Add block port endpoints using the v2 registry (fall back to v1).
    for block in ir1.blocks:
        ports = _get_ports(block, def_by_id)
        for port_id in ports:
            add((block.instance_id, port_id))

    # Add connection endpoints and union connected pairs.
    for conn in ir1.connections:
        add(conn.src)
        add(conn.dst)
        union(conn.src, conn.dst)

    # Collect net name per root component from connection.net.
    root_net_name: dict[tuple[str, str], str] = {}
    for conn in ir1.connections:
        if conn.net is not None and conn.src in parent:
            root = find(conn.src)
            root_net_name[root] = conn.net

    # Assign final net names deterministically.
    roots_seen: dict[tuple[str, str], str] = {}
    counter = 1
    net_names: dict[tuple[str, str], str] = {}

    for ep in sorted(parent):
        root = find(ep)
        if root not in roots_seen:
            given = root_net_name.get(root)
            if given is not None:
                ir1_net = net_specs.get(given)
                name = "0" if ir1_net is not None and ir1_net.is_reference else given
            else:
                name = f"net{counter}"
                counter += 1
            roots_seen[root] = name
        net_names[ep] = roots_seen[root]

    return net_names


def compute_node_domains(ir1: IR1Graph) -> dict[str, str]:
    """Map each v2-assigned SPICE net name to the ``.gsim_sch`` domain
    ("signal", "physical-electrical", ...) that produced it (BE-63).

    A net's domain comes from the first :class:`IR1Connection` touching it
    (``IR1Connection.kind`` — the same field already used by
    ``dim_propagate.py`` for bus/dim propagation). Nets with no connection
    at all — an isolated, unwired port — fall back to the owning block's
    own ``domain`` field.
    """
    def_by_id = {d.id: d for d in ir1.subckt_defs}
    nets = _assign_nets_v2(ir1, def_by_id)

    domains: dict[str, str] = {}
    for conn in ir1.connections:
        net_name = nets.get(conn.src)
        if net_name is not None and net_name not in domains:
            domains[net_name] = conn.kind

    block_domain = {b.instance_id: b.domain for b in ir1.blocks}
    for (block_id, _port_id), net_name in nets.items():
        if net_name not in domains:
            domains[net_name] = block_domain.get(block_id, "signal")

    return domains


# ---------------------------------------------------------------------------
# v2 block rendering helpers
# ---------------------------------------------------------------------------


def _subckt_instance_ports(
    block: IR1Block, def_by_id: dict[str, IR1SubcktDef] | None
) -> tuple[str, ...]:
    def_ref = str(block.params.get("def_ref", ""))
    target = (def_by_id or {}).get(def_ref)
    if target is None:
        raise ValueError(
            f"spice-subckt.instance block {block.instance_id!r} references "
            f"unknown SubcktDef def_ref {def_ref!r}"
        )
    return tuple(p.id for p in target.ports)


def _make_subckt_instance_renderer(subckt_name: str) -> _LegacyRenderer:
    def render(block: IR1Block, nets: dict[str, str]) -> str:
        name = _sanitize_instance_id("X", block.instance_id)
        return f"{name} {' '.join(nets.values())} {subckt_name}".rstrip()

    return render


def _get_ports(
    block: IR1Block, def_by_id: dict[str, IR1SubcktDef] | None = None
) -> tuple[str, ...]:
    """Return the port IDs for a block from the v2 registry or v1 fallback."""
    if block.block_type == _SUBCKT_INSTANCE_TYPE:
        return _subckt_instance_ports(block, def_by_id)
    if block.block_type in signal_flow_spice_lower.SIGNAL_FLOW_TYPES:
        return signal_flow_spice_lower.get_ports(block.block_type)
    v2spec = get_spec_v2(block.block_type, block.fidelity)
    if v2spec is not None:
        return v2spec.ports
    v1spec = BLOCK_TO_SPICE.get(block.block_type)
    if v1spec is not None:
        return v1spec.ports
    return ()


def _get_v2_render_info(
    block: IR1Block, def_by_id: dict[str, IR1SubcktDef] | None = None
) -> tuple[tuple[str, ...], Callable[[IR1Block, dict[str, str]], str]]:
    """Return *(ports, render_fn)* for the v2 write path.

    Raises :exc:`UnsupportedBlockError` for unregistered physical-electrical
    ``(type, fidelity)`` pairs, and :exc:`ValueError` for completely unknown
    block types.
    """
    if block.block_type == _SUBCKT_INSTANCE_TYPE:
        ports = _subckt_instance_ports(block, def_by_id)
        def_ref = str(block.params.get("def_ref", ""))
        target = (def_by_id or {})[def_ref]
        return ports, _make_subckt_instance_renderer(target.name)

    if block.block_type in signal_flow_spice_lower.SIGNAL_FLOW_TYPES:
        return signal_flow_spice_lower.get_ports(block.block_type), signal_flow_spice_lower.render

    v2spec: ElementSpec | None = get_spec_v2(block.block_type, block.fidelity)
    if v2spec is not None:
        return v2spec.ports, v2spec.render

    # Unknown physical-electrical type → explicit error.
    if block.block_type.startswith("physical-electrical."):
        raise UnsupportedBlockError(
            f"No SPICE writer for ({block.block_type!r}, {block.fidelity!r})"
        )

    # Fall back to v1 registry (legacy block types in a v2 graph).
    v1spec: _ElementSpec | None = BLOCK_TO_SPICE.get(block.block_type)
    if v1spec is None:
        raise ValueError(f"Unknown block type {block.block_type!r}")
    return v1spec.ports, v1spec.render


# ---------------------------------------------------------------------------
# v2 analysis line from AnalysisRequest
# ---------------------------------------------------------------------------


def _analysis_line_v2(req: AnalysisRequest) -> str:
    a_type = req.type.upper()
    p: dict[str, Any] = req.params

    if a_type == "TRAN":
        t_end = float(p.get("t_end", 1.0))
        t_step = float(p.get("t_step", t_end / 1000.0))
        uic = bool(p.get("uic", False))
        uic_suffix = " UIC" if uic else ""
        return f".TRAN {t_step:g} {t_end:g}{uic_suffix}"

    if a_type == "AC":
        n_points = int(p.get("n_points", 100))
        f_start = float(p.get("f_start", 1.0))
        f_end = float(p.get("f_end", 1e6))
        return f".AC DEC {n_points} {f_start:g} {f_end:g}"

    if a_type == "DC":
        source = str(p.get("source", ""))
        start = float(p.get("start", 0.0))
        stop = float(p.get("stop", 5.0))
        step = float(p.get("step", 0.1))
        return f".DC {source} {start:g} {stop:g} {step:g}"

    if a_type == "OP":
        return ".OP"

    raise ValueError(f"Unsupported analysis type {req.type!r}")


# ---------------------------------------------------------------------------
# Internal v2 write implementation
# ---------------------------------------------------------------------------


def _emit_subckt_defs(ir1: IR1Graph) -> list[str]:
    """Emit every declared SubcktDef exactly once as ``.SUBCKT ... .ENDS``,
    regardless of how many spice-subckt.instance blocks (or nested
    IR1SubcktInstances) reference it — an unreferenced def is harmless in a
    SPICE deck, and this avoids a separate reachability pass.

    Nested SubcktInstances are emitted as X-cards inside the parent's body;
    real SPICE resolves the referenced .SUBCKT wherever it is declared in
    the same deck (order-independent for ngspice/Xyce), so no dependency
    ordering or manual net-namespacing pass is needed here — a .SUBCKT
    block already scopes its own internal net names.
    """
    def_by_id = {d.id: d for d in ir1.subckt_defs}
    lines: list[str] = []
    for d in ir1.subckt_defs:
        pins = " ".join(p.id for p in d.ports)
        lines.append(f".SUBCKT {d.name} {pins}".rstrip())
        if d.body:
            lines.append(d.body.rstrip("\n"))
        for inst in d.instances:
            target = def_by_id.get(inst.def_ref)
            target_name = target.name if target is not None else inst.def_ref
            xname = _sanitize_instance_id("X", inst.id)
            conns = " ".join(inst.connections)
            lines.append(f"{xname} {conns} {target_name}".rstrip())
        lines.append(f".ENDS {d.name}")
    return lines


def _own_capacitor_ic(block: IR1Block) -> Any | None:
    """The IC the capacitor card renders on its own, mirroring the lookup
    order of the v2 and v1 capacitor renderers (``block.ic["v"]`` first,
    legacy ``params["IC"]`` second)."""
    ic_v = block.ic.get("v")
    if ic_v is None:
        ic_v = block.params.get("IC")
    return ic_v


def _ic_number(value: Any, what: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(
            f"{what} must be a number to be translated onto a capacitor IC "
            f"for the general-simulator target, got {value!r}"
        ) from None


def _format_ic(value: float) -> str:
    return f"{value:.15g}"


def _translate_node_ics_to_capacitors(
    ir1: IR1Graph, nets: dict[tuple[str, str], str]
) -> dict[str, str]:
    """Express every ``kind == "node"`` initial condition through the
    capacitors attached to that net (general-simulator target).

    Returns ``{instance_id: " IC=<value>"}`` — the suffix to append to each
    capacitor card that picks up a node IC it does not already carry. The
    value follows general-simulator's own convention for a capacitor ``ic``:
    the voltage of the card's first node minus that of its second, so a
    capacitor between two nets that both have a node IC gets the difference,
    and a ground-referenced one gets the net's IC (negated when ground is
    the first node).

    Raises :class:`NodeICConflictError` when a capacitor already carries its
    own IC and it disagrees with what the node IC implies. Emits a
    :class:`UserWarning` for every node IC no capacitor can express, since
    general-simulator would drop an ``.IC`` card for it silently.
    """
    node_ics: dict[str, Any] = {}
    for ic in ir1.simulation.initial_conditions:
        if ic.get("kind") == "node":
            node_ics[str(ic["name"])] = ic["value"]
    if not node_ics:
        return {}

    def potential(net: str) -> float | None:
        if net == "0":
            return 0.0
        if net in node_ics:
            return _ic_number(node_ics[net], f"node initial condition on net {net!r}")
        return None

    suffixes: dict[str, str] = {}
    covered: set[str] = set()
    for block in ir1.blocks:
        if block.block_type not in _CAPACITOR_TYPES:
            continue
        p_net = nets.get((block.instance_id, "p"), "0")
        n_net = nets.get((block.instance_id, "n"), "0")
        touched = {net for net in (p_net, n_net) if net in node_ics}
        if not touched:
            continue
        v_p, v_n = potential(p_net), potential(n_net)
        if v_p is None or v_n is None:
            # The other terminal floats with no node IC of its own, so this
            # capacitor's voltage is not determined by the node IC alone.
            continue
        implied = v_p - v_n
        own = _own_capacitor_ic(block)
        if own is not None:
            own_value = _ic_number(own, f"capacitor {block.instance_id!r} IC")
            if abs(own_value - implied) > 1e-12 * max(1.0, abs(implied)):
                nets_text = " and ".join(f"V({net})={node_ics[net]}" for net in sorted(touched))
                raise NodeICConflictError(
                    f"capacitor {block.instance_id!r} ({p_net} -> {n_net}) has IC={own} "
                    f"but node initial condition {nets_text} implies "
                    f"IC={_format_ic(implied)}; general-simulator cannot honour both"
                )
        else:
            suffixes[block.instance_id] = f" IC={_format_ic(implied)}"
        covered.update(touched)

    for net in node_ics:
        if net not in covered:
            warnings.warn(
                f"node initial condition V({net})={node_ics[net]} dropped: the "
                "general-simulator target does not support .IC and no capacitor "
                f"attached to net {net!r} can carry it; set the IC parameter on a "
                "capacitor instead",
                UserWarning,
                stacklevel=4,
            )
    return suffixes


def _write_netlist_v2(ir1: IR1Graph, request: AnalysisRequest, target: str) -> str:
    """Core v2 netlist writer — see :func:`write_netlist` for docs."""
    def_by_id = {d.id: d for d in ir1.subckt_defs}
    nets = _assign_nets_v2(ir1, def_by_id)
    lines: list[str] = ["* general-simulator SPICE netlist v2"]

    capacitor_ic_suffix: dict[str, str] = {}
    if target == TARGET_GENERAL_SIMULATOR:
        capacitor_ic_suffix = _translate_node_ics_to_capacitors(ir1, nets)

    # .PARAM cards — one per model param in declaration order.
    for pname, pvalue in ir1.params.items():
        lines.append(f".PARAM {pname}={pvalue:g}")

    lines.extend(_emit_subckt_defs(ir1))

    # Element cards.  Collect semiconductor model names as we go so we can
    # emit the corresponding .MODEL lines in a single footer block.
    diode_models: dict[str, str] = {}  # model_name → .MODEL card
    bjt_models: dict[str, str] = {}
    mosfet_models: dict[str, str] = {}

    for block in ir1.blocks:
        bt = block.block_type
        if bt == "physical-electrical.semiconductor.diode":
            overrides = diode_model_override_params(block)
            if overrides:
                # Explicit Is/N/Rs params mean the user wants our ideal
                # SPICE-parameterized diode, not a real vendor part — give
                # this instance its own uniquely named .MODEL, generated
                # before rendering so the instance card references it
                # directly (never shared, even with another ideal diode
                # that also sets overrides, so two differently-
                # parameterized instances never collide under one name).
                mname = _sanitize_instance_id("DMOD_", block.instance_id)
                params_text = " ".join(f"{k}={v}" for k, v in overrides.items())
                diode_models[mname] = f".MODEL {mname} D({params_text})"
                block.params["model"] = mname
            elif "model" not in block.params or block.params["model"] == "D":
                # No model specified (or explicitly our own "D" default):
                # safe to auto-generate, since "D" is our internal
                # convention, not a real part number a user could be
                # referencing.
                if "D" not in diode_models:
                    diode_models["D"] = ".MODEL D D(Is=1n N=1 Rs=0.01)"
            # else: a custom model name with no Is/N/Rs overrides is
            # assumed to reference a real manufacturer part the user will
            # supply externally (a .lib/.include, or an existing .MODEL
            # elsewhere in the deck) — never auto-generate a .MODEL card
            # for it, that would silently shadow/clobber the real
            # definition with a fake ideal one.

        ports, render_fn = _get_v2_render_info(block, def_by_id)
        port_nets = {port_id: nets.get((block.instance_id, port_id), "0") for port_id in ports}
        lines.append(render_fn(block, port_nets) + capacitor_ic_suffix.get(block.instance_id, ""))

        if bt in (
            "physical-electrical.semiconductor.bjt_npn",
            "physical-electrical.semiconductor.bjt_pnp",
        ):
            mname = str(block.params.get("model", "Q"))
            btype = "NPN" if "npn" in bt else "PNP"
            if mname not in bjt_models:
                bjt_models[mname] = f".MODEL {mname} {btype}"
        elif bt in (
            "physical-electrical.semiconductor.mosfet_n",
            "physical-electrical.semiconductor.mosfet_p",
        ):
            mname = str(block.params.get("model", "MOS"))
            mtype = "NMOS" if "_n" in bt else "PMOS"
            if mname not in mosfet_models:
                mosfet_models[mname] = f".MODEL {mname} {mtype}"

    # Emit .MODEL cards for all referenced semiconductor models.
    for card in {**diode_models, **bjt_models, **mosfet_models}.values():
        lines.append(card)

    # Node initial conditions. Only SPICE proper honours .IC; for
    # general-simulator they were already folded into the capacitor cards.
    if target != TARGET_GENERAL_SIMULATOR:
        for ic in ir1.simulation.initial_conditions:
            if ic.get("kind") == "node":
                net_name = str(ic["name"])
                ic_value = ic["value"]
                lines.append(f".IC V({net_name})={ic_value}")

    # Analysis card.
    lines.append(_analysis_line_v2(request))
    lines.append(".END")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Internal v1 write implementation
# ---------------------------------------------------------------------------


def _write_netlist_v1(ir1: IR1Graph, options: SolverOptions) -> str:
    """Legacy v1 writer — original BE-24 behaviour."""
    nets = _assign_nets(ir1)
    lines = ["* general-simulator classic SPICE netlist"]

    for block in ir1.blocks:
        spec = BLOCK_TO_SPICE.get(block.block_type)
        if spec is None:
            raise ValueError(f"Unknown block type {block.block_type!r}")
        port_nets = {port_id: nets[(block.instance_id, port_id)] for port_id in spec.ports}
        lines.append(spec.render(block, port_nets))

    lines.append(_analysis_line_v1(options))
    lines.append(".END")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


@overload
def write_netlist(ir1: IR1Graph, request: AnalysisRequest, *, target: str = ...) -> str: ...


@overload
def write_netlist(ir1: IR1Graph, request: SolverOptions, *, target: str = ...) -> str: ...


def write_netlist(
    ir1: IR1Graph, request: AnalysisRequest | SolverOptions, *, target: str = TARGET_SPICE
) -> str:
    """Emit a complete SPICE deck for *ir1*.

    Parameters
    ----------
    ir1:
        A compiled IR-1 graph.
    request:
        Either an :class:`~simulator.solvers.protocol.AnalysisRequest`
        (v2 path — named nets, .PARAM, node ICs) or a
        :class:`~simulator.solvers.protocol.SolverOptions` (v1 / legacy path).
    target:
        ``"spice"`` (default) for backends that honour ``.IC`` — ngspice,
        Xyce; ``"general-simulator"`` folds node initial conditions into the
        capacitor cards' ``IC=`` field instead and never emits ``.IC``.

    Returns
    -------
    str
        A SPICE netlist string ending with ``.END``.
    """
    if target not in _KNOWN_TARGETS:
        raise ValueError(
            f"Unknown netlist target {target!r}; expected one of {sorted(_KNOWN_TARGETS)}"
        )
    if isinstance(request, SolverOptions):
        return _write_netlist_v1(ir1, request)
    return _write_netlist_v2(ir1, request, target)
