"""SPICE card emitter helpers for the v2 netlist writer (BE-36).

Provides:
- ``UnsupportedBlockError`` — raised when no writer entry exists for a
  ``(block_type, fidelity)`` pair.
- ``ElementSpec`` — descriptor bundling SPICE prefix, port list and render
  callable.
- A registry of all supported physical-electrical types/fidelities.
- ``get_spec_v2`` / ``require_spec_v2`` — registry look-up helpers.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from simulator.ir.ir1 import IR1Block

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

CardRenderer = Callable[[IR1Block, dict[str, str]], str]


class UnsupportedBlockError(ValueError):
    """Raised when no SPICE writer entry exists for a (type, fidelity) pair."""


@dataclass(frozen=True)
class ElementSpec:
    prefix: str
    ports: tuple[str, ...]
    render: CardRenderer


# ---------------------------------------------------------------------------
# Helpers shared by all renderers
# ---------------------------------------------------------------------------


def sanitize_instance_id(prefix: str, instance_id: str) -> str:
    """Return a SPICE-safe element name: ``<prefix><sanitised_id>``."""
    cleaned = re.sub(r"[^A-Za-z0-9_]", "_", instance_id)
    cleaned = cleaned.lstrip("_") or "inst"
    return f"{prefix}{cleaned}"


def render_param_value(value: Any) -> str:
    """Render a block param value for SPICE output.

    * String values are treated as model-param references and wrapped in
      ``{name}`` so SPICE substitutes the ``.PARAM`` value.
    * Float values are rendered with ``%g`` (no trailing zeros).
    * Everything else is converted via ``str()``.
    """
    if isinstance(value, str):
        return f"{{{value}}}"
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


# ---------------------------------------------------------------------------
# Passive element renderers
# ---------------------------------------------------------------------------


def _render_resistor(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("R", block.instance_id)
    r_val = render_param_value(block.params.get("R", "1000"))
    return f"{name} {nets['p']} {nets['n']} R={r_val}"


def _render_capacitor(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("C", block.instance_id)
    c_val = render_param_value(block.params.get("C", "1e-6"))
    line = f"{name} {nets['p']} {nets['n']} {c_val}"
    # Per-block IC: prefer IR1Block.ic["v"], fall back to params["IC"] (legacy).
    ic_v: Any = block.ic.get("v")
    if ic_v is None:
        ic_v = block.params.get("IC")
    if ic_v is not None:
        line += f" IC={ic_v}"
    return line


def _render_inductor(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("L", block.instance_id)
    l_val = render_param_value(block.params.get("L", "1e-3"))
    line = f"{name} {nets['p']} {nets['n']} {l_val}"
    # Per-block IC: prefer IR1Block.ic["i"], fall back to params["IC"] (legacy).
    ic_i: Any = block.ic.get("i")
    if ic_i is None:
        ic_i = block.params.get("IC")
    if ic_i is not None:
        line += f" IC={ic_i}"
    return line


# ---------------------------------------------------------------------------
# Source renderers
# ---------------------------------------------------------------------------


def _render_voltage_dc(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("V", block.instance_id)
    v_val = render_param_value(block.params.get("V", 0))
    return f"{name} {nets['p']} {nets['n']} DC {v_val}"


def _render_voltage_ac(block: IR1Block, nets: dict[str, str]) -> str:
    # Emits both an AC small-signal magnitude (for .AC analysis) and a
    # transient SIN(...) waveform at the same amplitude/frequency/phase —
    # SPICE sources support both simultaneously; .AC only ever looks at
    # the "AC <mag>" spec and .TRAN only ever looks at the SIN(...) spec,
    # so neither analysis interferes with the other.
    name = sanitize_instance_id("V", block.instance_id)
    amp = render_param_value(block.params.get("V", 1))
    freq = render_param_value(block.params.get("freq", 60))
    phase = render_param_value(block.params.get("phase", 0))
    return f"{name} {nets['p']} {nets['n']} DC 0 AC {amp} SIN(0 {amp} {freq} 0 0 {phase})"


def _render_current_dc(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("I", block.instance_id)
    i_val = render_param_value(block.params.get("I", 0))
    return f"{name} {nets['p']} {nets['n']} DC {i_val}"


def _render_current_ac(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("I", block.instance_id)
    amp = render_param_value(block.params.get("I", 1))
    freq = render_param_value(block.params.get("freq", 60))
    phase = render_param_value(block.params.get("phase", 0))
    return f"{name} {nets['p']} {nets['n']} DC 0 AC {amp} SIN(0 {amp} {freq} 0 0 {phase})"


def _render_voltage_pulse(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("V", block.instance_id)
    v1 = render_param_value(block.params.get("V1", 0))
    v2 = render_param_value(block.params.get("V2", 1))
    td = render_param_value(block.params.get("TD", 0))
    tr = render_param_value(block.params.get("TR", 1e-9))
    tf = render_param_value(block.params.get("TF", 1e-9))
    pw = render_param_value(block.params.get("PW", 500e-9))
    per = render_param_value(block.params.get("PER", 1e-6))
    return f"{name} {nets['p']} {nets['n']} PULSE({v1} {v2} {td} {tr} {tf} {pw} {per})"


# ---------------------------------------------------------------------------
# Semiconductor renderers
# ---------------------------------------------------------------------------


def _render_diode(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("D", block.instance_id)
    model = block.params.get("model", "D")
    return f"{name} {nets['a']} {nets['k']} {model}"


def diode_model_override_params(block: IR1Block) -> dict[str, str]:
    """Return the ngspice diode-model params this instance overrides
    (Is/N/Rs — the real Shockley-equation params; ngspice's D-model has no
    RON/ROFF/VFWD-style ideal-switch shortcut the way some other SPICE
    variants' diode models do), or an empty dict if none are set."""
    overrides: dict[str, str] = {}
    for gsim_name, spice_name in (("Is", "Is"), ("N", "N"), ("Rs", "Rs")):
        if gsim_name in block.params:
            overrides[spice_name] = render_param_value(block.params[gsim_name])
    return overrides


def _render_bjt_npn(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("Q", block.instance_id)
    model = block.params.get("model", "QNPN")
    return f"{name} {nets['c']} {nets['b']} {nets['e']} {model}"


def _render_mosfet_n(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("M", block.instance_id)
    model = block.params.get("model", "NMOS")
    w_val = render_param_value(block.params.get("W", "1e-6"))
    l_val = render_param_value(block.params.get("L", "180e-9"))
    # SPICE MOSFET: M name d g s b model W=... L=...
    return f"{name} {nets['d']} {nets['g']} {nets['s']} {nets['s']} {model} W={w_val} L={l_val}"


def _render_mosfet_p(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("M", block.instance_id)
    model = block.params.get("model", "PMOS")
    w_val = render_param_value(block.params.get("W", "1e-6"))
    l_val = render_param_value(block.params.get("L", "180e-9"))
    return f"{name} {nets['d']} {nets['g']} {nets['s']} {nets['s']} {model} W={w_val} L={l_val}"


# ---------------------------------------------------------------------------
# Switch renderers (BE-65)
# ---------------------------------------------------------------------------


def _render_switch_voltage_controlled(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("S", block.instance_id)
    model = sanitize_instance_id("SWMOD_", block.instance_id)
    v_on = float(block.params.get("v_on", 1.0))
    v_off = float(block.params.get("v_off", 0.0))
    vt = (v_on + v_off) / 2
    vh = (v_on - v_off) / 2
    r_on = render_param_value(block.params.get("r_on", 0.001))
    r_off = render_param_value(block.params.get("r_off", 1000000.0))
    return (
        f"{name} {nets['p']} {nets['n']} {nets['p_ctl']} {nets['n_ctl']} {model}\n"
        f".model {model} SW(VT={vt:g} VH={vh:g} RON={r_on} ROFF={r_off})"
    )


def _render_switch_generic(block: IR1Block, nets: dict[str, str]) -> str:
    # Single-ended control (physical-signal 'ctl' vs an implicit reference)
    # — the S-device's second control node is tied to "0", so ctl is
    # compared against threshold directly (VH=0, no hysteresis band).
    name = sanitize_instance_id("S", block.instance_id)
    model = sanitize_instance_id("SWMOD_", block.instance_id)
    threshold = render_param_value(block.params.get("threshold", 0.5))
    r_on = render_param_value(block.params.get("r_on", 0.001))
    r_off = render_param_value(block.params.get("r_off", 1000000.0))
    return (
        f"{name} {nets['p']} {nets['n']} {nets['ctl']} 0 {model}\n"
        f".model {model} SW(VT={threshold} VH=0 RON={r_on} ROFF={r_off})"
    )


def _render_switch_current_controlled(block: IR1Block, nets: dict[str, str]) -> str:
    # W-device current-controlled switches sense current through a named
    # voltage source, not a node pair — insert a 0V sense source on the
    # control branch, same "0V source as ammeter" trick already used by
    # _render_ammeter, and reference its name from the W-device card.
    name = sanitize_instance_id("W", block.instance_id)
    sense_name = sanitize_instance_id("Vsns", block.instance_id)
    model = sanitize_instance_id("CSWMOD_", block.instance_id)
    i_on = float(block.params.get("i_on", 0.01))
    i_off = float(block.params.get("i_off", 0.0))
    it = (i_on + i_off) / 2
    ih = (i_on - i_off) / 2
    r_on = render_param_value(block.params.get("r_on", 0.001))
    r_off = render_param_value(block.params.get("r_off", 1000000.0))
    return (
        f"{sense_name} {nets['p_ctl']} {nets['n_ctl']} DC 0\n"
        f"{name} {nets['p']} {nets['n']} {sense_name} {model}\n"
        f".model {model} CSW(IT={it:g} IH={ih:g} RON={r_on} ROFF={r_off})"
    )


# ---------------------------------------------------------------------------
# Op-amp renderers (BE-66)
# ---------------------------------------------------------------------------

# DC open-loop gain assumed for band_limited's single-pole model — no such
# param exists on the block (only gbp/sr/rin/rout), so a large fixed value
# stands in, same convention real op-amp macromodels use when only GBP is
# given: pole_freq = gbp / assumed_open_loop_gain.
_BAND_LIMITED_ASSUMED_OPEN_LOOP_GAIN = 100000.0


def _render_opamp_ideal(block: IR1Block, nets: dict[str, str]) -> str:
    # A single high-gain VCVS is the standard "ideal op-amp" trick — no
    # block params to map, the block declares none.
    name = sanitize_instance_id("E", block.instance_id)
    return f"{name} {nets['out']} 0 {nets['vp']} {nets['vn']} 1e6"


def _render_opamp_finite_gain(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("B", block.instance_id)
    av = render_param_value(block.params.get("Av", 100000.0))
    v_sat = render_param_value(block.params.get("v_sat", 15.0))
    diff = f"{av}*(V({nets['vp']})-V({nets['vn']}))"
    expr = f"({diff} > {v_sat} ? {v_sat} : ({diff} < -{v_sat} ? -{v_sat} : {diff}))"
    return f"{name} {nets['out']} 0 V={expr}"


def _render_opamp_comparator(block: IR1Block, nets: dict[str, str]) -> str:
    # hyst (XSPICE) takes a single 'in' port; the comparator's inputs are
    # differential (vp, vn), so a B-source first computes the difference
    # onto an internal node, then hyst thresholds that node — same
    # multi-element composition style as the switch current-sense branch.
    diff_name = sanitize_instance_id("B", block.instance_id)
    diff_net = sanitize_instance_id("", block.instance_id) + "_diff"
    hyst_name = sanitize_instance_id("A", block.instance_id)
    hyst_model = sanitize_instance_id("CMPMOD_", block.instance_id)
    v_hys = float(block.params.get("v_hys", 0.0))
    v_oh = render_param_value(block.params.get("v_oh", 5.0))
    v_ol = render_param_value(block.params.get("v_ol", 0.0))
    in_low = -v_hys / 2
    in_high = v_hys / 2
    return (
        f"{diff_name} {diff_net} 0 V=V({nets['vp']})-V({nets['vn']})\n"
        f"{hyst_name} {diff_net} {nets['out']} {hyst_model}\n"
        f".model {hyst_model} hyst(in_low={in_low:g} in_high={in_high:g} "
        f"out_lower_limit={v_ol} out_upper_limit={v_oh})"
    )


def _render_opamp_band_limited(block: IR1Block, nets: dict[str, str]) -> str:
    # Single-pole gain-bandwidth-limited + slew-rate-limited macromodel:
    # Rin loads the differential input, an s_xfer stage applies the
    # assumed open-loop DC gain with its pole set from gbp, an XSPICE
    # slew stage rate-limits the result, and Rout appears in series with
    # the output. Exact topology is intentionally not load-bearing here
    # (BE-66 scopes this block's acceptance more loosely than the other
    # three) — the falsifiable behavior is a bounded slew rate on a real
    # ngspice run, not this specific circuit shape.
    base = sanitize_instance_id("", block.instance_id)
    diff_net = f"{base}_diff"
    gain_net = f"{base}_gain"
    slew_net = f"{base}_slew"

    gbp = float(block.params.get("gbp", 1000000.0))
    sr = render_param_value(block.params.get("sr", 500000.0))
    rin = render_param_value(block.params.get("rin", 1000000.0))
    rout = render_param_value(block.params.get("rout", 75.0))

    a0 = _BAND_LIMITED_ASSUMED_OPEN_LOOP_GAIN
    pole_hz = gbp / a0

    rin_name = sanitize_instance_id("R", block.instance_id) + "in"
    diff_name = sanitize_instance_id("B", block.instance_id)
    xfer_name = sanitize_instance_id("A", block.instance_id) + "g"
    xfer_model = sanitize_instance_id("BWMOD_", block.instance_id)
    slew_name = sanitize_instance_id("A", block.instance_id) + "s"
    slew_model = sanitize_instance_id("SRMOD_", block.instance_id)
    e_name = sanitize_instance_id("E", block.instance_id)
    rout_name = sanitize_instance_id("R", block.instance_id) + "out"

    return (
        f"{rin_name} {nets['vp']} {nets['vn']} {rin}\n"
        f"{diff_name} {diff_net} 0 V=V({nets['vp']})-V({nets['vn']})\n"
        f"{xfer_name} {diff_net} {gain_net} {xfer_model}\n"
        f".model {xfer_model} s_xfer(gain={a0:g} num_coeff=[1] "
        f"den_coeff=[{1 / (2 * 3.141592653589793 * pole_hz):g} 1])\n"
        f"{slew_name} {gain_net} {slew_net} {slew_model}\n"
        f".model {slew_model} slew(rise_slope={sr} fall_slope=-{sr})\n"
        f"{e_name} {base}_outpre 0 {slew_net} 0 1\n"
        f"{rout_name} {base}_outpre {nets['out']} {rout}"
    )


# ---------------------------------------------------------------------------
# Coupled-magnetics renderers (BE-67)
# ---------------------------------------------------------------------------

# Base primary-side inductance used to realize an "ideal" transformer via
# two coupled inductors — SPICE has no dedicated turns-ratio-only ideal
# transformer element, so the standard trick is L1 (arbitrary but
# reasonable base value) and L2 = L1 * n^2, tightly coupled (k close to
# but never exactly 1.0, which SPICE treats as singular).
_TRANSFORMER_BASE_L1 = 1e-3
_TRANSFORMER_COUPLING_K = 0.999


def _render_mutual_inductor(block: IR1Block, nets: dict[str, str]) -> str:
    l1_name = sanitize_instance_id("L", block.instance_id) + "1"
    l2_name = sanitize_instance_id("L", block.instance_id) + "2"
    k_name = sanitize_instance_id("K", block.instance_id)
    l1 = render_param_value(block.params.get("L1", 1e-6))
    l2 = render_param_value(block.params.get("L2", 1e-6))
    k = render_param_value(block.params.get("k", 0.99))
    return (
        f"{l1_name} {nets['p1']} {nets['n1']} {l1}\n"
        f"{l2_name} {nets['p2']} {nets['n2']} {l2}\n"
        f"{k_name} {l1_name} {l2_name} {k}"
    )


def _render_transformer(block: IR1Block, nets: dict[str, str]) -> str:
    l1_name = sanitize_instance_id("L", block.instance_id) + "1"
    l2_name = sanitize_instance_id("L", block.instance_id) + "2"
    k_name = sanitize_instance_id("K", block.instance_id)
    n = float(block.params.get("n", 1.0))
    l1 = _TRANSFORMER_BASE_L1
    l2 = l1 * n * n
    return (
        f"{l1_name} {nets['p1']} {nets['n1']} {l1:g}\n"
        f"{l2_name} {nets['p2']} {nets['n2']} {l2:g}\n"
        f"{k_name} {l1_name} {l2_name} {_TRANSFORMER_COUPLING_K:g}"
    )


# ---------------------------------------------------------------------------
# Probe renderers (0 V sources for measurement)
# ---------------------------------------------------------------------------


def _render_voltmeter(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("V", block.instance_id)
    return f"{name} {nets['p']} {nets['n']} DC 0"


def _render_ammeter(block: IR1Block, nets: dict[str, str]) -> str:
    # A 0 V voltage source acts as an ideal ammeter in SPICE.
    name = sanitize_instance_id("V", block.instance_id)
    return f"{name} {nets['p']} {nets['n']} DC 0"


# ---------------------------------------------------------------------------
# Controlled source renderers
# ---------------------------------------------------------------------------


def _render_controlled_voltage(block: IR1Block, nets: dict[str, str]) -> str:
    # B-source (behavioural): the signal 'in' port is not an electrical net.
    name = sanitize_instance_id("B", block.instance_id)
    gain = render_param_value(block.params.get("gain", 1))
    return f"{name} {nets['p']} {nets['n']} V={gain}"


def _render_controlled_current(block: IR1Block, nets: dict[str, str]) -> str:
    name = sanitize_instance_id("B", block.instance_id)
    gain = render_param_value(block.params.get("gain", 1))
    return f"{name} {nets['p']} {nets['n']} I={gain}"


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_PN = ("p", "n")

_V2_REGISTRY: dict[tuple[str, str], ElementSpec] = {}


def _reg(
    block_type: str,
    fidelity: str,
    prefix: str,
    ports: tuple[str, ...],
    render: CardRenderer,
) -> None:
    _V2_REGISTRY[(block_type, fidelity)] = ElementSpec(prefix, ports, render)


# ── physical-electrical.passive.resistor (ideal / behavioral / spice) ──────
for _t in ("ideal", "behavioral", "spice"):
    _reg("physical-electrical.passive.resistor", _t, "R", _PN, _render_resistor)

# ── physical-electrical.passive.capacitor (ideal / behavioral / spice) ──────
for _t in ("ideal", "behavioral", "spice"):
    _reg("physical-electrical.passive.capacitor", _t, "C", _PN, _render_capacitor)

# ── physical-electrical.passive.inductor (ideal / behavioral / spice) ───────
for _t in ("ideal", "behavioral", "spice"):
    _reg("physical-electrical.passive.inductor", _t, "L", _PN, _render_inductor)

# ── physical-electrical.source.voltage_dc ───────────────────────────────────
_reg("physical-electrical.source.voltage_dc", "ideal", "V", _PN, _render_voltage_dc)

# ── physical-electrical.source.voltage_ac ───────────────────────────────────
_reg("physical-electrical.source.voltage_ac", "ideal", "V", _PN, _render_voltage_ac)

# ── physical-electrical.source.current_dc ───────────────────────────────────
_reg("physical-electrical.source.current_dc", "ideal", "I", _PN, _render_current_dc)

# ── physical-electrical.source.current_ac ───────────────────────────────────
_reg("physical-electrical.source.current_ac", "ideal", "I", _PN, _render_current_ac)

_reg("physical-electrical.source.voltage_pulse", "ideal", "V", _PN, _render_voltage_pulse)

# ── physical-electrical.source.voltage.controlled_voltage ───────────────────
# 'in' is a signal port — only the two electrical ports are handled here.
_reg(
    "physical-electrical.source.voltage.controlled_voltage",
    "ideal",
    "B",
    _PN,
    _render_controlled_voltage,
)

# ── physical-electrical.source.voltage.controlled_current ───────────────────
_reg(
    "physical-electrical.source.voltage.controlled_current",
    "ideal",
    "B",
    _PN,
    _render_controlled_current,
)

# ── physical-electrical.semiconductor.diode (ideal) ─────────────────────────
_reg("physical-electrical.semiconductor.diode", "ideal", "D", ("a", "k"), _render_diode)

# ── physical-electrical.semiconductor.bjt_npn (ideal) ───────────────────────
_reg(
    "physical-electrical.semiconductor.bjt_npn",
    "ideal",
    "Q",
    ("b", "c", "e"),
    _render_bjt_npn,
)

# ── physical-electrical.semiconductor.mosfet_n (ideal) ──────────────────────
_reg(
    "physical-electrical.semiconductor.mosfet_n",
    "ideal",
    "M",
    ("g", "d", "s"),
    _render_mosfet_n,
)

# ── physical-electrical.semiconductor.mosfet_p (ideal) ──────────────────────
_reg(
    "physical-electrical.semiconductor.mosfet_p",
    "ideal",
    "M",
    ("g", "d", "s"),
    _render_mosfet_p,
)

# ── physical-electrical.probe.voltmeter (ideal) ─────────────────────────────
_reg("physical-electrical.probe.voltmeter", "ideal", "V", _PN, _render_voltmeter)

# ── physical-electrical.probe.ammeter (ideal) ───────────────────────────────
_reg("physical-electrical.probe.ammeter", "ideal", "V", _PN, _render_ammeter)

# ── physical-electrical.switch.voltage_controlled (ideal) — BE-65 ───────────
_reg(
    "physical-electrical.switch.voltage_controlled",
    "ideal",
    "S",
    ("p", "n", "p_ctl", "n_ctl"),
    _render_switch_voltage_controlled,
)

# ── physical-electrical.switch.generic (ideal) — BE-65 ──────────────────────
_reg(
    "physical-electrical.switch.generic",
    "ideal",
    "S",
    ("p", "n", "ctl"),
    _render_switch_generic,
)

# ── physical-electrical.switch.current_controlled (ideal) — BE-65 ───────────
_reg(
    "physical-electrical.switch.current_controlled",
    "ideal",
    "W",
    ("p", "n", "p_ctl", "n_ctl"),
    _render_switch_current_controlled,
)

_OPAMP_PORTS = ("vp", "vn", "out")

# Every opamp.* block declares both "ideal" and "behavioral" fidelity tiers
# in its catalog metadata (docs differ, e.g. "no saturation" vs "with
# saturation") but the block's params are the same regardless — register
# both tiers against the same renderer rather than leave one silently
# uncompilable depending on which tier a document happens to use.
for _t in ("ideal", "behavioral"):
    _reg("physical-electrical.opamp.ideal", _t, "E", _OPAMP_PORTS, _render_opamp_ideal)
    _reg(
        "physical-electrical.opamp.finite_gain", _t, "B", _OPAMP_PORTS, _render_opamp_finite_gain
    )
    _reg(
        "physical-electrical.opamp.comparator", _t, "A", _OPAMP_PORTS, _render_opamp_comparator
    )
    _reg(
        "physical-electrical.opamp.band_limited",
        _t,
        "A",
        _OPAMP_PORTS,
        _render_opamp_band_limited,
    )

_XFMR_PORTS = ("p1", "n1", "p2", "n2")

# ── physical-electrical.passive.mutual_inductor (ideal/behavioral/spice) — BE-67
for _t in ("ideal", "behavioral", "spice"):
    _reg(
        "physical-electrical.passive.mutual_inductor",
        _t,
        "L",
        _XFMR_PORTS,
        _render_mutual_inductor,
    )

# ── physical-electrical.passive.transformer (ideal/behavioral/spice) — BE-67
for _t in ("ideal", "behavioral", "spice"):
    _reg("physical-electrical.passive.transformer", _t, "L", _XFMR_PORTS, _render_transformer)


# ---------------------------------------------------------------------------
# Public accessors
# ---------------------------------------------------------------------------


def get_spec_v2(block_type: str, fidelity: str) -> ElementSpec | None:
    """Return the :class:`ElementSpec` for *(block_type, fidelity)*, or ``None``."""
    return _V2_REGISTRY.get((block_type, fidelity))


def require_spec_v2(block_type: str, fidelity: str) -> ElementSpec:
    """Return the :class:`ElementSpec` or raise :exc:`UnsupportedBlockError`."""
    spec = get_spec_v2(block_type, fidelity)
    if spec is None:
        raise UnsupportedBlockError(
            f"No SPICE writer for block type {block_type!r} at fidelity {fidelity!r}"
        )
    return spec
