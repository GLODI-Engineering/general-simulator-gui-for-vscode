"""B-source + XSPICE analog compiler pass for signal-flow blocks (BE-61).

Compiles signal_flow.math.*, signal_flow.logic.*, signal_flow.continuous.*,
and signal_flow.discontinuity.* blocks to real SPICE cards instead of
running only on the separate scipy solver:

- Math/Logic blocks compile to a single B-source (Bxxxx) card — ngspice's
  B-source natively supports trig/hyperbolic/exp/log/abs/sqrt/min/max/pow/
  ternary and the logical operators these blocks need, so no XSPICE
  codemodel is required for this half (see manual chapter 5.1).
- Continuous/Discontinuities blocks compile to an XSPICE A-device
  instance plus its own dedicated .model card (int, d_dt, s_xfer, limit,
  slew, hyst) — requires BE-60's XSPICE runtime bootstrap to actually run.
  LAPLACE is not a native E-source keyword in this ngspice build, so
  transfer_function is emulated via s_xfer per the manual's own
  documented workaround (chapter 5.2.5): num_coeff/den_coeff arrays.
- Discrete blocks (BE-62) compile via the ``astate`` XSPICE codemodel
  ("analog state delayed" — chapter 8.2.35), which stores the last 0-3
  *simulator timesteps* of a v-typed node. This was chosen over the more
  obvious ``real_delay`` (chapter 8.3.6, a literal Z^-1 block) because
  real_delay's in/out ports are strictly XSPICE "real"-typed with no
  documented v-to-real bridge — confirmed with a real ngspice run raising
  "Can not insert bridge for mixed-type node" when fed directly from a
  v-typed signal-flow net. astate is v-typed throughout and composes
  directly with everything else in this module. The tradeoff: astate
  delays by simulator timesteps, not a fixed wall-clock sample_time, so
  results depend on the solver's actual step size (matches sample_time
  only if .TRAN's step is set to it) — a documented approximation, not
  exact discrete-time semantics. signal_flow.discrete.zero_order_hold has
  no working native mapping under this constraint and is left explicitly
  unsupported (UnsupportedSignalFlowParamError) rather than silently wrong.

- Sequential digital blocks (BE-68): signal-flow.logic.{dff,srff} compile
  via XSPICE's genuinely digital d_dff/d_srff codemodels (chapter 8.4),
  sandwiched between adc_bridge/dac_bridge pairs (chapter 8.3) so their
  external ports stay v-typed like every other signal-flow block — the
  first time this module crosses into XSPICE's digital domain at all.
  signal-flow.logic.sample_hold is NOT built the same way: XSPICE digital
  flip-flops only hold a single *bit*, not an arbitrary analog magnitude,
  so a d_dff-based design cannot sample-and-hold a real value (this was
  the original plan; corrected before implementing). Instead sample_hold
  reuses the switch+capacitor track-and-hold pattern — an S-device
  (BE-65's voltage-controlled switch card shape) gated by clk, charging a
  holding capacitor, buffered out via a B-source so nothing loads the
  capacitor — a genuine analog track-and-hold circuit, not a digital latch.

- Rotating-frame transforms (BE-70): signal-flow.transform.{alpha_beta,
  alpha_beta_inv,dq,dq_inv,angle_wrap} compile to plain B-source cards
  (ngspice natively supports sin/cos/floor in B-source expressions, so no
  XSPICE codemodel is needed). Clarke/Park and their inverses have more
  outputs than inputs or vice versa (3<->2 for Clarke, 2<->2 for Park), so
  the original epic's single "direction"-parameterized block type was
  split into separate forward/inverse block types — one type per fixed
  port arity. Multi-output blocks needed a new _bsource_multi() helper
  (one B-source card per output net) since _bsource() only ever targets
  nets['out'].

Each render function returns the *complete* card text for its block,
including an embedded newline for the two-line (instance + .model) case —
the netlist writer just appends whatever string comes back, so no special
multi-card plumbing is needed there.
"""

from __future__ import annotations

from collections.abc import Callable

from simulator.compiler.spice_card_emitters import render_param_value, sanitize_instance_id
from simulator.ir.ir1 import IR1Block

_PORTS: dict[str, tuple[str, ...]] = {
    "signal-flow.math.abs": ("in", "out"),
    "signal-flow.math.sign": ("in", "out"),
    "signal-flow.math.sqrt": ("in", "out"),
    "signal-flow.math.divide": ("in0", "in1", "out"),
    "signal-flow.math.gain": ("in", "out"),
    "signal-flow.math.math_function": ("in", "out"),
    "signal-flow.math.product": ("in0", "in1", "out"),
    "signal-flow.math.sum": ("in0", "in1", "out"),
    "signal-flow.math.trigonometric": ("in", "out"),
    "signal-flow.math.minmax": ("in0", "in1", "out"),
    "signal-flow.math.rounding": ("in", "out"),
    "signal-flow.logic.and": ("in0", "in1", "out"),
    "signal-flow.logic.or": ("in0", "in1", "out"),
    "signal-flow.logic.not": ("in", "out"),
    "signal-flow.logic.compare": ("in0", "in1", "out"),
    "signal-flow.continuous.integrator": ("in", "out"),
    "signal-flow.continuous.derivative": ("in", "out"),
    "signal-flow.continuous.transfer_function": ("in", "out"),
    "signal-flow.continuous.pid": ("in", "out"),
    "signal-flow.discontinuity.saturation": ("in", "out"),
    "signal-flow.discontinuity.rate_limiter": ("in", "out"),
    "signal-flow.discontinuity.relay": ("in", "out"),
    "signal-flow.discrete.unit_delay": ("in", "out"),
    "signal-flow.discrete.delay": ("in", "out"),
    "signal-flow.discrete.zero_order_hold": ("in", "out"),
    "signal-flow.discrete.integrator": ("in", "out"),
    "signal-flow.lookup.1d": ("in", "out"),
    "signal-flow.lookup.2d": ("in0", "in1", "out"),
    "signal-flow.logic.dff": ("clk", "d", "q"),
    "signal-flow.logic.srff": ("clk", "s", "r", "q"),
    "signal-flow.logic.sample_hold": ("in", "clk", "out"),
    "signal-flow.transform.alpha_beta": ("a", "b", "c", "alpha", "beta"),
    "signal-flow.transform.alpha_beta_inv": ("alpha", "beta", "a", "b", "c"),
    "signal-flow.transform.dq": ("alpha", "beta", "theta", "d", "q"),
    "signal-flow.transform.dq_inv": ("d", "q", "theta", "alpha", "beta"),
    "signal-flow.transform.angle_wrap": ("in", "out"),
    "signal-flow.source.sine": ("out",),
    "signal-flow.source.constant": ("out",),
}

SIGNAL_FLOW_TYPES: frozenset[str] = frozenset(_PORTS)


class UnsupportedSignalFlowParamError(ValueError):
    """Raised for a param combination this pass cannot compile — e.g. a
    math_function/trigonometric operator (pow/atan2) that needs a second
    input the current signal-flow.* catalog metadata doesn't declare a
    port for."""


def get_ports(block_type: str) -> tuple[str, ...]:
    return _PORTS[block_type]


def _num(block: IR1Block, name: str, default: float) -> float:
    return float(block.params.get(name, default))


def _param(block: IR1Block, name: str, default: float | str) -> str:
    return render_param_value(block.params.get(name, default))


def _vector(values: object) -> str:
    """Render a param's list value as an XSPICE coefficient array, e.g.
    [1.0] -> "[1.0]"."""
    items = values if isinstance(values, list) else [values]
    return "[" + " ".join(render_param_value(v) for v in items) + "]"


# ---------------------------------------------------------------------------
# B-source renderers (Math, Logic) — no XSPICE codemodel required.
# ---------------------------------------------------------------------------


def _bsource(block: IR1Block, nets: dict[str, str], expr: str) -> str:
    name = sanitize_instance_id("B", block.instance_id)
    return f"{name} {nets['out']} 0 V={expr}"


def _bsource_multi(block: IR1Block, nets: dict[str, str], exprs: dict[str, str]) -> str:
    """One B-source card per (output_port_id, expr) pair — for blocks with
    more than one output, which _bsource can't express (it always targets
    nets['out'])."""
    lines = []
    for port_id, expr in exprs.items():
        name = sanitize_instance_id("B", block.instance_id) + "_" + port_id
        lines.append(f"{name} {nets[port_id]} 0 V={expr}")
    return "\n".join(lines)


def _r_abs(block: IR1Block, nets: dict[str, str]) -> str:
    return _bsource(block, nets, f"abs(V({nets['in']}))")


def _r_sign(block: IR1Block, nets: dict[str, str]) -> str:
    v = f"V({nets['in']})"
    return _bsource(block, nets, f"({v} > 0 ? 1 : ({v} < 0 ? -1 : 0))")


def _r_sqrt(block: IR1Block, nets: dict[str, str]) -> str:
    return _bsource(block, nets, f"sqrt(V({nets['in']}))")


def _r_divide(block: IR1Block, nets: dict[str, str]) -> str:
    return _bsource(block, nets, f"V({nets['in0']})/V({nets['in1']})")


def _r_gain(block: IR1Block, nets: dict[str, str]) -> str:
    k = _param(block, "k", 1.0)
    return _bsource(block, nets, f"V({nets['in']})*{k}")


_MATH_FUNCTIONS = {"exp": "exp", "log": "ln", "log10": "log10", "sqrt": "sqrt"}


def _r_math_function(block: IR1Block, nets: dict[str, str]) -> str:
    operator = str(block.params.get("operator", "exp"))
    fn = _MATH_FUNCTIONS.get(operator)
    if fn is None:
        raise UnsupportedSignalFlowParamError(
            f"signal_flow.math.math_function operator {operator!r} needs a "
            f"second input (exponent) the current block metadata has no "
            f"port for."
        )
    return _bsource(block, nets, f"{fn}(V({nets['in']}))")


def _r_product(block: IR1Block, nets: dict[str, str]) -> str:
    signs = str(block.params.get("signs", "**"))
    op1 = "/" if len(signs) > 1 and signs[1] == "/" else "*"
    return _bsource(block, nets, f"V({nets['in0']}){op1}V({nets['in1']})")


def _r_sum(block: IR1Block, nets: dict[str, str]) -> str:
    signs = str(block.params.get("signs", "++"))
    sign0 = "-" if signs[:1] == "-" else ""
    sign1 = "-" if len(signs) > 1 and signs[1] == "-" else "+"
    return _bsource(block, nets, f"{sign0}V({nets['in0']}){sign1}V({nets['in1']})")


_TRIG_FUNCTIONS = {"sin": "sin", "cos": "cos", "tan": "tan"}


def _r_trigonometric(block: IR1Block, nets: dict[str, str]) -> str:
    operator = str(block.params.get("operator", "sin"))
    fn = _TRIG_FUNCTIONS.get(operator)
    if fn is None:
        raise UnsupportedSignalFlowParamError(
            f"signal_flow.math.trigonometric operator {operator!r} needs a "
            f"second input the current block metadata has no port for."
        )
    return _bsource(block, nets, f"{fn}(V({nets['in']}))")


def _r_minmax(block: IR1Block, nets: dict[str, str]) -> str:
    function = str(block.params.get("function", "max"))
    if function not in ("min", "max"):
        raise UnsupportedSignalFlowParamError(
            f"signal_flow.math.minmax function {function!r} must be 'min' or 'max'"
        )
    return _bsource(block, nets, f"{function}(V({nets['in0']}),V({nets['in1']}))")


_ROUNDING_FUNCTIONS = {"floor": "floor", "ceil": "ceil"}


def _r_rounding(block: IR1Block, nets: dict[str, str]) -> str:
    operator = str(block.params.get("operator", "floor"))
    fn = _ROUNDING_FUNCTIONS.get(operator)
    if fn is None:
        raise UnsupportedSignalFlowParamError(
            f"signal_flow.math.rounding operator {operator!r} must be 'floor' or 'ceil'"
        )
    return _bsource(block, nets, f"{fn}(V({nets['in']}))")


def _r_and(block: IR1Block, nets: dict[str, str]) -> str:
    return _bsource(block, nets, f"V({nets['in0']}) && V({nets['in1']})")


def _r_or(block: IR1Block, nets: dict[str, str]) -> str:
    return _bsource(block, nets, f"V({nets['in0']}) || V({nets['in1']})")


def _r_not(block: IR1Block, nets: dict[str, str]) -> str:
    return _bsource(block, nets, f"!V({nets['in']})")


_COMPARE_OPERATORS = frozenset({"==", "!=", "<", "<=", ">", ">="})


def _r_compare(block: IR1Block, nets: dict[str, str]) -> str:
    operator = str(block.params.get("operator", ">"))
    if operator not in _COMPARE_OPERATORS:
        raise UnsupportedSignalFlowParamError(f"Unsupported compare operator {operator!r}")
    return _bsource(block, nets, f"V({nets['in0']}) {operator} V({nets['in1']})")


# ---------------------------------------------------------------------------
# XSPICE analog codemodel renderers (Continuous, Discontinuities) — require
# BE-60's XSPICE runtime bootstrap at solve time.
# ---------------------------------------------------------------------------


def _xspice(
    block: IR1Block, nets: dict[str, str], port_order: tuple[str, ...], model_kind: str, params: str
) -> str:
    model_name = sanitize_instance_id("model_", block.instance_id)
    name = sanitize_instance_id("A", block.instance_id)
    node_list = " ".join(nets[p] for p in port_order)
    return f"{name} {node_list} {model_name}\n.model {model_name} {model_kind}({params})"


def _r_integrator(block: IR1Block, nets: dict[str, str]) -> str:
    lo = _param(block, "lo", -1e9)
    hi = _param(block, "hi", 1e9)
    ic = _param(block, "ic", 0.0)
    params = f"gain=1.0 in_offset=0.0 out_lower_limit={lo} out_upper_limit={hi} out_ic={ic}"
    return _xspice(block, nets, ("in", "out"), "int", params)


def _r_derivative(block: IR1Block, nets: dict[str, str]) -> str:
    params = "gain=1.0 out_offset=0.0 out_lower_limit=-1e12 out_upper_limit=1e12"
    return _xspice(block, nets, ("in", "out"), "d_dt", params)


def _r_transfer_function(block: IR1Block, nets: dict[str, str]) -> str:
    num = block.params.get("num", [1.0])
    den = block.params.get("den", [1.0, 1.0])
    params = f"gain=1.0 num_coeff={_vector(num)} den_coeff={_vector(den)}"
    return _xspice(block, nets, ("in", "out"), "s_xfer", params)


def _r_pid(block: IR1Block, nets: dict[str, str]) -> str:
    # PI only (kd=0) for now — kd would need a filtered-derivative XSPICE
    # composition (d_dt + a low-pass, per the "Filter N" param) that no
    # current use case in this compiler pass needs yet. "parallel" and
    # "ideal" forms are treated identically: both catalog params are
    # already plain gains (kp/ki/kd), not the ideal form's Ti/Td, so there
    # is no conversion to perform between them.
    kp = _num(block, "kp", 1.0)
    ki = _num(block, "ki", 0.0)
    kd = _num(block, "kd", 0.0)
    if kd != 0:
        raise UnsupportedSignalFlowParamError(
            "signal-flow.continuous.pid: kd != 0 (derivative term) is not yet supported"
        )
    int_net = _instance_net(block, "int")
    int_name = sanitize_instance_id("A", block.instance_id) + "int"
    int_model = sanitize_instance_id("PIDINT_", block.instance_id)
    int_line = f"{int_name} {nets['in']} {int_net} {int_model}"
    int_model_line = (
        f".model {int_model} int(gain=1.0 in_offset=0.0 "
        "out_lower_limit=-1e12 out_upper_limit=1e12 out_ic=0.0)"
    )
    out_line = _bsource(block, nets, f"{kp:g}*V({nets['in']})+{ki:g}*V({int_net})")
    return "\n".join([int_line, int_model_line, out_line])


def _r_saturation(block: IR1Block, nets: dict[str, str]) -> str:
    lo = _param(block, "lo", -1.0)
    hi = _param(block, "hi", 1.0)
    params = f"in_offset=0.0 gain=1.0 out_lower_limit={lo} out_upper_limit={hi}"
    return _xspice(block, nets, ("in", "out"), "limit", params)


def _r_rate_limiter(block: IR1Block, nets: dict[str, str]) -> str:
    rising = _param(block, "rising", 1.0)
    falling = _param(block, "falling", -1.0)
    params = f"rise_slope={rising} fall_slope={falling}"
    return _xspice(block, nets, ("in", "out"), "slew", params)


def _r_relay(block: IR1Block, nets: dict[str, str]) -> str:
    off_switch = _param(block, "off_switch", -0.5)
    on_switch = _param(block, "on_switch", 0.5)
    off_out = _param(block, "off_out", 0.0)
    on_out = _param(block, "on_out", 1.0)
    params = (
        f"in_low={off_switch} in_high={on_switch} "
        f"out_lower_limit={off_out} out_upper_limit={on_out}"
    )
    return _xspice(block, nets, ("in", "out"), "hyst", params)


# ---------------------------------------------------------------------------
# Lookup table renderers.
# ---------------------------------------------------------------------------


def _r_lookup_1d(block: IR1Block, nets: dict[str, str]) -> str:
    x = block.params.get("x", [0.0, 1.0])
    y = block.params.get("y", [0.0, 1.0])
    params = f"x_array={_vector(x)} y_array={_vector(y)}"
    return _xspice(block, nets, ("in", "out"), "pwl", params)


def _r_lookup_2d(block: IR1Block, nets: dict[str, str]) -> str:
    raise UnsupportedSignalFlowParamError(
        "signal_flow.lookup.2d has no working native ngspice mapping: the "
        "natural primitive, XSPICE's table2d codemodel, reads its table "
        "data from an external file on disk (manual chapter 8.2.30) rather "
        "than from inline .model parameters, and write_netlist has no "
        "mechanism today to emit a companion file alongside the netlist "
        "text it returns. table2d's 'out' port is also current- rather "
        "than voltage-typed by default, unlike every other block this "
        "module compiles."
    )


# ---------------------------------------------------------------------------
# Discrete (astate-based) renderers — see module docstring for why astate
# rather than real_delay.
# ---------------------------------------------------------------------------

_ASTATE_MAX_STATES = 3


def _astate_delay(block: IR1Block, nets: dict[str, str], astate_no: int) -> str:
    if not 0 <= astate_no <= _ASTATE_MAX_STATES:
        raise UnsupportedSignalFlowParamError(
            f"astate only supports astate_no in [0, {_ASTATE_MAX_STATES}], got {astate_no}"
        )
    return _xspice(block, nets, ("in", "out"), "astate", f"astate_no={astate_no}")


def _r_unit_delay(block: IR1Block, nets: dict[str, str]) -> str:
    return _astate_delay(block, nets, astate_no=1)


def _r_delay(block: IR1Block, nets: dict[str, str]) -> str:
    length = int(block.params.get("length", 1))
    return _astate_delay(block, nets, astate_no=length)


def _r_zero_order_hold(block: IR1Block, nets: dict[str, str]) -> str:
    raise UnsupportedSignalFlowParamError(
        "signal_flow.discrete.zero_order_hold has no working native ngspice "
        "mapping: real_delay would be the natural clocked sample-and-hold "
        "primitive, but its ports are XSPICE 'real'-typed with no "
        "documented v-to-real bridge, so it cannot be driven from a "
        "v-typed signal-flow net (confirmed by a real ngspice run raising "
        "'Can not insert bridge for mixed-type node')."
    )


def _instance_net(block: IR1Block, suffix: str) -> str:
    base = sanitize_instance_id("", block.instance_id)
    return f"{base}_{suffix}"


def _r_discrete_integrator(block: IR1Block, nets: dict[str, str]) -> str:
    method = str(block.params.get("method", "forward"))
    sample_time = _param(block, "sample_time", 0.01)
    in_net = nets["in"]
    out_net = nets["out"]

    yprev_net = _instance_net(block, "yprev")
    y_astate_name = sanitize_instance_id("A", block.instance_id) + "y"
    y_astate_model = sanitize_instance_id("model_", block.instance_id) + "y"
    lines = [
        f"{y_astate_name} {out_net} {yprev_net} {y_astate_model}",
        f".model {y_astate_model} astate(astate_no=1)",
    ]

    if method == "backward":
        expr = f"V({yprev_net})+{sample_time}*V({in_net})"
    elif method in ("forward", "trapezoidal"):
        uprev_net = _instance_net(block, "uprev")
        u_astate_name = sanitize_instance_id("A", block.instance_id) + "u"
        u_astate_model = sanitize_instance_id("model_", block.instance_id) + "u"
        lines.append(f"{u_astate_name} {in_net} {uprev_net} {u_astate_model}")
        lines.append(f".model {u_astate_model} astate(astate_no=1)")
        if method == "forward":
            expr = f"V({yprev_net})+{sample_time}*V({uprev_net})"
        else:
            expr = f"V({yprev_net})+({sample_time}/2)*(V({in_net})+V({uprev_net}))"
    else:
        raise UnsupportedSignalFlowParamError(
            f"signal_flow.discrete.integrator method {method!r} is not one of "
            f"forward, backward, trapezoidal"
        )

    b_name = sanitize_instance_id("B", block.instance_id)
    lines.append(f"{b_name} {out_net} 0 V={expr}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Sequential digital renderers (BE-68) — the first blocks in this module to
# cross into XSPICE's digital domain, via adc_bridge/dac_bridge pairs so
# external ports stay v-typed like everything else here.
# ---------------------------------------------------------------------------

_ADC_BRIDGE_PARAMS = "in_low=1 in_high=4"
_DAC_BRIDGE_PARAMS = "out_low=0 out_high=5"


def _adc_bridge(block: IR1Block, suffix: str, v_net: str) -> tuple[str, list[str]]:
    """Return (digital_net_name, [instance_line, model_line])."""
    d_net = f"{_instance_net(block, suffix)}_d"
    name = sanitize_instance_id("A", block.instance_id) + suffix + "adc"
    model = sanitize_instance_id("ADCMOD_", block.instance_id) + suffix
    return d_net, [
        f"{name} [{v_net}] [{d_net}] {model}",
        f".model {model} adc_bridge({_ADC_BRIDGE_PARAMS})",
    ]


def _dac_bridge(block: IR1Block, suffix: str, d_net: str, v_net: str) -> list[str]:
    name = sanitize_instance_id("A", block.instance_id) + suffix + "dac"
    model = sanitize_instance_id("DACMOD_", block.instance_id) + suffix
    return [
        f"{name} [{d_net}] [{v_net}] {model}",
        f".model {model} dac_bridge({_DAC_BRIDGE_PARAMS})",
    ]


def _d_tie_low(block: IR1Block, suffix: str) -> tuple[str, list[str]]:
    """A digital node permanently pulled low, for d_dff's optional
    (Null_Allowed) set/reset ports — this module never needs asynchronous
    set/reset, so both are tied inactive."""
    d_net = f"{_instance_net(block, suffix)}_d"
    name = sanitize_instance_id("A", block.instance_id) + suffix + "pd"
    model = sanitize_instance_id("PDMOD_", block.instance_id) + suffix
    # d_pulldown's "out" port is non-vector — no brackets, unlike
    # adc_bridge/dac_bridge's vector in/out ports.
    return d_net, [f"{name} {d_net} {model}", f".model {model} d_pulldown()"]


def _r_dff(block: IR1Block, nets: dict[str, str]) -> str:
    clk_d, clk_lines = _adc_bridge(block, "clk", nets["clk"])
    d_d, d_lines = _adc_bridge(block, "d", nets["d"])
    set_d, set_lines = _d_tie_low(block, "set")
    reset_d, reset_lines = _d_tie_low(block, "reset")

    q_d = f"{_instance_net(block, 'q')}_d"
    nq_d = f"{_instance_net(block, 'nq')}_d"
    dff_name = sanitize_instance_id("A", block.instance_id) + "dff"
    dff_model = sanitize_instance_id("DFFMOD_", block.instance_id)
    # d_dff's data/clk/set/reset/out/Nout ports are all non-vector — no
    # brackets on this card, unlike the adc_bridge/dac_bridge lines above.
    dff_lines = [
        f"{dff_name} {d_d} {clk_d} {set_d} {reset_d} {q_d} {nq_d} {dff_model}",
        f".model {dff_model} d_dff()",
    ]

    out_lines = _dac_bridge(block, "q", q_d, nets["q"])
    return "\n".join([*clk_lines, *d_lines, *set_lines, *reset_lines, *dff_lines, *out_lines])


def _r_srff(block: IR1Block, nets: dict[str, str]) -> str:
    # d_srff has its OWN separate asynchronous set/reset ports beyond s/r
    # (s r clk set reset out Nout — 7 positions total, confirmed against
    # the manual after an initial run with only 5 silently misaligned
    # the trailing out/Nout positions) — tied inactive, same as d_dff.
    clk_d, clk_lines = _adc_bridge(block, "clk", nets["clk"])
    s_d, s_lines = _adc_bridge(block, "s", nets["s"])
    r_d, r_lines = _adc_bridge(block, "r", nets["r"])
    aset_d, aset_lines = _d_tie_low(block, "aset")
    areset_d, areset_lines = _d_tie_low(block, "areset")

    q_d = f"{_instance_net(block, 'q')}_d"
    nq_d = f"{_instance_net(block, 'nq')}_d"
    srff_name = sanitize_instance_id("A", block.instance_id) + "srff"
    srff_model = sanitize_instance_id("SRFFMOD_", block.instance_id)
    srff_lines = [
        f"{srff_name} {s_d} {r_d} {clk_d} {aset_d} {areset_d} {q_d} {nq_d} {srff_model}",
        f".model {srff_model} d_srff()",
    ]

    out_lines = _dac_bridge(block, "q", q_d, nets["q"])
    return "\n".join(
        [*clk_lines, *s_lines, *r_lines, *aset_lines, *areset_lines, *srff_lines, *out_lines]
    )


def _r_sample_hold(block: IR1Block, nets: dict[str, str]) -> str:
    # A genuine analog track-and-hold: clk closes an S-device switch
    # (same card shape as BE-65's voltage_controlled switch) connecting
    # 'in' to a holding capacitor while clk is above threshold; a
    # B-source buffers the capacitor voltage out so nothing loads it.
    threshold = render_param_value(block.params.get("threshold", 0.5))
    hold_net = _instance_net(block, "hold")
    sw_name = sanitize_instance_id("S", block.instance_id)
    sw_model = sanitize_instance_id("SHMOD_", block.instance_id)
    cap_name = sanitize_instance_id("C", block.instance_id)
    buf_name = sanitize_instance_id("B", block.instance_id)
    return "\n".join(
        [
            f"{sw_name} {nets['in']} {hold_net} {nets['clk']} 0 {sw_model}",
            f".model {sw_model} SW(VT={threshold} VH=0 RON=1 ROFF=1e9)",
            f"{cap_name} {hold_net} 0 1n",
            f"{buf_name} {nets['out']} 0 V=V({hold_net})",
        ]
    )


# Rotating-frame transforms (BE-70). Clarke/Park and their inverses each
# have more than one output, which the single-output _bsource can't
# express, hence _bsource_multi (one B-source card per output net).
_SQRT3_OVER_2 = 0.8660254037844386
_ONE_OVER_SQRT3 = 0.5773502691896258
_TWO_PI = 6.283185307179586


def _r_alpha_beta(block: IR1Block, nets: dict[str, str]) -> str:
    a, b, c = f"V({nets['a']})", f"V({nets['b']})", f"V({nets['c']})"
    return _bsource_multi(
        block,
        nets,
        {
            "alpha": f"(2/3)*({a}-0.5*{b}-0.5*{c})",
            "beta": f"{_ONE_OVER_SQRT3}*({b}-{c})",
        },
    )


def _r_alpha_beta_inv(block: IR1Block, nets: dict[str, str]) -> str:
    alpha, beta = f"V({nets['alpha']})", f"V({nets['beta']})"
    return _bsource_multi(
        block,
        nets,
        {
            "a": alpha,
            "b": f"-0.5*{alpha}+{_SQRT3_OVER_2}*{beta}",
            "c": f"-0.5*{alpha}-{_SQRT3_OVER_2}*{beta}",
        },
    )


def _r_dq(block: IR1Block, nets: dict[str, str]) -> str:
    alpha, beta = f"V({nets['alpha']})", f"V({nets['beta']})"
    theta = f"V({nets['theta']})"
    return _bsource_multi(
        block,
        nets,
        {
            "d": f"{alpha}*cos({theta})+{beta}*sin({theta})",
            "q": f"-{alpha}*sin({theta})+{beta}*cos({theta})",
        },
    )


def _r_dq_inv(block: IR1Block, nets: dict[str, str]) -> str:
    d, q = f"V({nets['d']})", f"V({nets['q']})"
    theta = f"V({nets['theta']})"
    return _bsource_multi(
        block,
        nets,
        {
            "alpha": f"{d}*cos({theta})-{q}*sin({theta})",
            "beta": f"{d}*sin({theta})+{q}*cos({theta})",
        },
    )


def _r_angle_wrap(block: IR1Block, nets: dict[str, str]) -> str:
    x = f"V({nets['in']})"
    return _bsource(block, nets, f"{x}-{_TWO_PI}*floor({x}/{_TWO_PI})")


def _r_source_constant(block: IR1Block, nets: dict[str, str]) -> str:
    value = _num(block, "value", 1.0)
    return _bsource(block, nets, f"{value:g}")


def _r_source_sine(block: IR1Block, nets: dict[str, str]) -> str:
    # A zero-input B-source using ngspice's special `time` variable —
    # phase/frequency/amplitude/bias all match the conventional editor's Sine Wave block
    # convention (phase in radians).
    amp = _num(block, "amplitude", 1.0)
    freq = _num(block, "frequency", 1.0)
    phase = _num(block, "phase", 0.0)
    bias = _num(block, "bias", 0.0)
    return _bsource(block, nets, f"{bias:g}+{amp:g}*sin({_TWO_PI:g}*{freq:g}*time+{phase:g})")


_RENDERERS: dict[str, Callable[[IR1Block, dict[str, str]], str]] = {
    "signal-flow.math.abs": _r_abs,
    "signal-flow.math.sign": _r_sign,
    "signal-flow.math.sqrt": _r_sqrt,
    "signal-flow.math.divide": _r_divide,
    "signal-flow.math.gain": _r_gain,
    "signal-flow.math.math_function": _r_math_function,
    "signal-flow.math.product": _r_product,
    "signal-flow.math.sum": _r_sum,
    "signal-flow.math.trigonometric": _r_trigonometric,
    "signal-flow.math.minmax": _r_minmax,
    "signal-flow.math.rounding": _r_rounding,
    "signal-flow.logic.and": _r_and,
    "signal-flow.logic.or": _r_or,
    "signal-flow.logic.not": _r_not,
    "signal-flow.logic.compare": _r_compare,
    "signal-flow.continuous.integrator": _r_integrator,
    "signal-flow.continuous.derivative": _r_derivative,
    "signal-flow.continuous.transfer_function": _r_transfer_function,
    "signal-flow.continuous.pid": _r_pid,
    "signal-flow.discontinuity.saturation": _r_saturation,
    "signal-flow.discontinuity.rate_limiter": _r_rate_limiter,
    "signal-flow.discontinuity.relay": _r_relay,
    "signal-flow.discrete.unit_delay": _r_unit_delay,
    "signal-flow.discrete.delay": _r_delay,
    "signal-flow.discrete.zero_order_hold": _r_zero_order_hold,
    "signal-flow.discrete.integrator": _r_discrete_integrator,
    "signal-flow.lookup.1d": _r_lookup_1d,
    "signal-flow.lookup.2d": _r_lookup_2d,
    "signal-flow.logic.dff": _r_dff,
    "signal-flow.logic.srff": _r_srff,
    "signal-flow.logic.sample_hold": _r_sample_hold,
    "signal-flow.transform.alpha_beta": _r_alpha_beta,
    "signal-flow.transform.alpha_beta_inv": _r_alpha_beta_inv,
    "signal-flow.transform.dq": _r_dq,
    "signal-flow.transform.dq_inv": _r_dq_inv,
    "signal-flow.transform.angle_wrap": _r_angle_wrap,
    "signal-flow.source.sine": _r_source_sine,
    "signal-flow.source.constant": _r_source_constant,
}


def render(block: IR1Block, nets: dict[str, str]) -> str:
    """Return the full SPICE card text (one or two lines) for *block*."""
    handler = _RENDERERS.get(block.block_type)
    if handler is None:
        raise ValueError(f"signal_flow_spice_lower: unhandled block type {block.block_type!r}")
    return handler(block, nets)
