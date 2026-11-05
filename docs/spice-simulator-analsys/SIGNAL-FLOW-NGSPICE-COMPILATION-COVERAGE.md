---
title: signal-flow -> ngspice compilation coverage
status: living document — update alongside packages/simulator/src/simulator/compiler/signal_flow_spice_lower.py
related:
  - the block-diagram palette catalogue (clean-room analysis notes, not tracked here)
  - docs/spice-simulator-analsys/NGSPICE-XSPICE-MODEL-CATALOG.md (ngspice primitive reference)
  - progress.backend.yaml BP17 (BE-60..BE-63)
  - docs/simulator-component-support.md (the *other* coverage doc — frontend simulator-compat.yaml filter, unrelated system, see "Relationship to the frontend simulator filter" below)
---

# signal-flow → ngspice compilation coverage

This is the backend compiler-coverage reference for `signal-flow.*` blocks: which
ones compile to a **real ngspice netlist** today (`packages/simulator/src/simulator/compiler/signal_flow_spice_lower.py`),
which are explicit, documented non-goals, and which simply haven't been built yet.

Before this work (epics BE-60 through BE-63, `progress.backend.yaml` phase BP17),
every `signal-flow.*` block ran exclusively on the separate scipy solver. This
document tracks the new, additive path: compiling a subset of them directly into
SPICE cards that a real ngspice subprocess solves, alongside the rest of the
circuit. The scipy path is unaffected and still the only path for anything not
listed as "Compiled" below.

## How compilation works, in one paragraph

Two mechanisms, chosen per block, both implemented in `signal_flow_spice_lower.py`:

- **B-source** (`Bxxxx ... V=<expr>`) — for anything expressible as a single
  ngspice expression (trig, exp/log, abs, sqrt, min/max, ternary, logical
  operators). No XSPICE codemodel needed; this is core ngspice.
- **XSPICE analog codemodel** (an `Axxxx` instance + its own `.model` card) —
  for stateful/dynamic blocks (integrator, derivative, transfer function,
  saturation, rate limiter, relay, discrete delay/integrator). Requires
  `packages/simulator/src/simulator/solvers/xspice_bootstrap.py` (BE-60) to
  actually load at solve time — this happens automatically now, no manual setup.

## Coverage by the block-diagram convention category

Legend: **Compiled** = real ngspice card(s) emitted and verified against a live
ngspice run · **Unsupported (explicit)** = the block type is recognized but
raises `UnsupportedSignalFlowParamError` with a documented reason, never
silently wrong · **Not started** = no compiler entry exists; falls through to
the generic "Unknown block type" error if you try, and no catalog block exists
at all for most of the remaining the block-diagram convention-side rows.

### Continuous

| `signal-flow.continuous.*` block | Status | Mechanism / note |
|---|---|---|
| `derivative` | **Compiled** | XSPICE `d_dt` |
| `integrator` | **Compiled** | XSPICE `int` — `ic`/`lo`/`hi` map to `out_ic`/`out_lower_limit`/`out_upper_limit` |
| `transfer_function` | **Compiled** | XSPICE `s_xfer` — LAPLACE isn't a native E-source keyword in this ngspice build, emulated via `s_xfer`'s `num_coeff`/`den_coeff` per the manual's own documented workaround (§5.2.5) |
| `pid` | **Not started** | Catalog block exists (`signal_flow.continuous.pid`); no compiler entry yet. Natural next step: compile to a `sum`+`gain`+`int`+`d_dt` network (P/I/D terms), or a single `s_xfer` if the PID form reduces to one transfer function |
| `state_space` | **Not started** | Catalog block exists (`signal_flow.continuous.state_space`); `s_xfer` is SISO-scalar only, so a general A/B/C/D matrix needs a *generated* network of one `int`+B-source per state — a codegen problem, not a single codemodel |
| Integrator Limited, Second-Order (+Limited), Descriptor State-Space, PID 2DOF, Transport/Variable Delay, Zero-Pole | **Not started** | No catalog block exists for any of these yet (the block-diagram convention-only, per the source catalog) |

### Discontinuities

| `signal-flow.discontinuity.*` block | Status | Mechanism / note |
|---|---|---|
| `saturation` | **Compiled** | XSPICE `limit` |
| `rate_limiter` | **Compiled** | XSPICE `slew` |
| `relay` | **Compiled** | XSPICE `hyst` |
| `dead_zone` | **Not started** | Catalog block exists (`signal_flow.discontinuity.dead_zone`); no compiler entry yet. No dedicated XSPICE codemodel for dead-zone either — natural fit is a B-source ternary expression (`V = (in > hi) ? in-hi : (in < lo) ? in-lo : 0`), same technique already used for `signal.sign` |
| Backlash, Coulomb & Viscous Friction, Dead Zone Dynamic, Hit Crossing, Quantizer, Rate/Saturation Dynamic variants, Wrap To Zero | **Not started** | No catalog block exists yet |

### Math Operations

| `signal-flow.math.*` block | Status | Mechanism / note |
|---|---|---|
| `abs`, `sign`, `sqrt`, `divide`, `gain`, `product`, `sum` | **Compiled** | B-source |
| `math_function` | **Compiled (partial)** | B-source for `exp`/`log`/`log10`/`sqrt`; **`pow` unsupported (explicit)** — needs a second input (exponent) the current catalog metadata has no port for |
| `trigonometric` | **Compiled (partial)** | B-source for `sin`/`cos`/`tan`; **`atan2` unsupported (explicit)** — same second-input gap |
| MinMax, Rounding, Polynomial, Dot Product, Reshape, Squeeze, Sum/Product of Elements, Unary Minus, Vector Concatenate, Bias, Signed Sqrt, Reciprocal Sqrt, Complex ops, Assignment, Algebraic Constraint | **Not started** | No catalog block exists for any of these; several (Reshape, Squeeze, Vector Concatenate, matrix-mode `gain`) are vector/matrix operations that aren't really circuit primitives at all — better candidates for the scipy path or a pre-processing step than for SPICE compilation |

### Logic and Bit Operations

| `signal-flow.logic.*` block | Status | Mechanism / note |
|---|---|---|
| `and`, `or`, `not`, `compare` | **Compiled** | B-source, using ngspice's native logical operators (`&&`, `||`, `!`, `==`/`!=`/`<`/`<=`/`>`/`>=`) — nonzero is truthy, matching the compare block's own convention |
| Bit Clear/Set, Bitwise Operator, Combinatorial Logic, Compare To Constant/Zero, Detect Change/Increase/Decrease/Rise/Fall, Extract Bits, Interval Test, Shift Arithmetic | **Not started** | No catalog block exists yet. If/when built: XSPICE's digital codemodels (`d_and`/`d_or`/.../`d_lut`/`d_state`, chapter 8.4) are the natural target for anything that needs real event-driven digital semantics; plain B-source boolean expressions (as used for `and`/`or`/`not`/`compare` above) suffice for anything purely combinational |

### Discrete

| `signal-flow.discrete.*` block | Status | Mechanism / note |
|---|---|---|
| `unit_delay` | **Compiled** | XSPICE `astate(astate_no=1)` — see caveat below |
| `delay` | **Compiled** | XSPICE `astate(astate_no=<length>)`, `length` capped to `astate`'s supported range [0, 3] |
| `integrator` | **Compiled** | `astate`-based feedback network; shape differs by `method` (forward/backward/trapezoidal) — see `signal_flow_spice_lower._r_discrete_integrator` |
| `zero_order_hold` | **Unsupported (explicit)** | The natural primitive, XSPICE `real_delay`, has strictly "real"-typed ports with **no documented v-to-real bridge** — confirmed with a live ngspice run raising `Can not insert bridge for mixed-type node` when fed directly from a v-typed signal-flow net. Rather than approximate this wrongly, it raises `UnsupportedSignalFlowParamError` |
| Memory, Tapped Delay, Discrete PID (1DOF/2DOF), Discrete Filter/FIR Filter, Discrete State-Space, Discrete Transfer Fcn, Discrete Zero-Pole, Difference, Enabled/Resettable/Variable Integer Delay, Transfer Fcn First Order/Lead-Lag/Real Zero | **Not started** | No catalog block exists yet |

### Lookup Tables

Not one of the main the block-diagram convention categories tracked above, but a real `signal-flow.*`
family with two catalog blocks:

| `signal-flow.lookup.*` block | Status | Mechanism / note |
|---|---|---|
| `1d` (catalog `name:` is `signal_flow.lookup.table_1d`, but `Block.type` — what actually appears in a `.gsim_sch` document — is `signal-flow.lookup.1d`; the two differ for this block specifically, unlike every other signal-flow block where they match up to the underscore/hyphen convention) | **Compiled** | XSPICE `pwl(x_array=[...] y_array=[...])` — v-typed both directions, params map directly from the block's `x`/`y` breakpoint vectors, verified against a live ngspice run |
| `2d` (`Block.type` is `signal-flow.lookup.2d`) | **Unsupported (explicit)** | The natural primitive, XSPICE's `table2d` codemodel, reads its table data from an **external file on disk** (manual §8.2.30) rather than inline `.model` params — `write_netlist` has no mechanism today to emit a companion file alongside the netlist text it returns. Its `out` port also defaults to current-typed rather than voltage-typed, unlike everything else this module compiles. Initially assumed to be "the easiest next addition" before checking the manual in detail — it isn't; it needs new file-emission plumbing in the netlist-writing pipeline, a real (if modest) new capability, not just another dict entry |

### Not covered by this document at all

- **`signal-flow.attributes.*`** (`ic`, `probe`, `signal_specification`, `unit_conversion`) — structural/annotation blocks, not computational; out of scope for this compiler pass by nature, not by gap.
- **`signal-flow.routing.*`**, **`signal-flow.sink.*`**, **`signal-flow.source.*`** — separate concern (signal routing/sinks/sources), not touched by BE-60..63 and not part of this document's scope.
- **Matrix Operations**, **User-Defined Functions** (the block-diagram convention categories) — no catalog blocks exist for either. Per the earlier ngspice/XSPICE capability survey: Matrix Operations aren't circuit primitives at all (vector/matrix preprocessing, better suited to the scipy path or parameter-resolution time); User-Defined Functions have no real SPICE-native equivalent beyond simple B-source expressions (already covered for `math_function`-style single-expression cases) — arbitrary user code would need ngspice's `d_process`/`d_cosim` external co-simulation escape hatch, a materially different, unstarted piece of work.

## The `astate` timestep caveat (Discrete category)

`unit_delay`/`delay`/`integrator` are built on XSPICE's `astate` codemodel
("analog state delayed", manual §8.2.35), which delays by **0–3 simulator
timesteps**, not by a fixed wall-clock `sample_time`. This was a deliberate,
verified pivot away from the more obviously-named `real_delay` (a literal
Z⁻¹ block), which turned out to be a dead end: its ports are strictly
XSPICE "real"-typed, and there is no documented way to drive one from a
v-typed net (confirmed by the same `Can not insert bridge` error noted above
for `zero_order_hold`).

Practical implication: a compiled `signal_flow.discrete.*` block's actual
delay only matches its `sample_time` parameter if the enclosing `.TRAN`
analysis's step size is also set to (or a divisor of) that `sample_time`.
This is a real, load-bearing constraint on any circuit combining these
blocks — not merely a documentation footnote — until/unless a future epic
solves the real-type-bridging problem for `real_delay` (e.g. by building an
explicit v↔real bridge, or by switching to a clocked `adc_bridge`-driven
design once that dead end is better understood).

## The XSPICE runtime prerequisite (BE-60)

None of the "Compiled" rows above run without `packages/simulator/src/simulator/solvers/xspice_bootstrap.py`
successfully loading ngspice's XSPICE codemodels at solve time — this now
happens automatically inside `NgspiceSolver.solve()` whenever the netlist
contains an XSPICE `A`-device, but it depends on the resolved ngspice binary
actually having been built with `--enable-xspice` (i.e. having `*.cm` files
under `lib/ngspice/`). If a future deployment's ngspice binary lacks that,
every "Compiled" row in this document degrades to a clear
`XSpiceNotAvailableError` rather than a working simulation — not a silent
fallback to the scipy path.

## Relationship to the frontend simulator filter

`docs/simulator-component-support.md` / `docs/simulator-component-integration.md`
document a **different, unrelated** system: the frontend's `ngspice`/`Xyce`/`SciPy`
library filter, driven by `apps/frontend/src/library/simulator-compat.yaml`. As of
this writing, that catalog does **not** list any `signal-flow.*` block as
`ngspice`-compatible — the compilation work in this document exists at the
backend-compiler level only and has not yet been wired into the frontend's
per-simulator filter. Marking the "Compiled" rows above as ngspice-eligible in
`simulator-compat.yaml` (and regenerating `catalog-manifest.json`) is a real,
separate, not-yet-done follow-up task if/when this compilation path is meant to
be user-selectable from the UI rather than purely a backend capability.

## Where to look when extending this

- `packages/simulator/src/simulator/compiler/signal_flow_spice_lower.py` — the
  compiler pass itself; `_PORTS`/`_RENDERERS` are the two dicts to extend for a
  new block type.
- `packages/simulator/src/simulator/compiler/subckt_lower.py` and
  `spice_netlist_writer.compute_node_domains` — related BP17 machinery (SPICE
  subckt reuse, signal-vs-voltage result tagging) that any new block type
  automatically benefits from without further work.
- `packages/simulator/tests/test_signal_flow_spice_lower.py` and
  `test_signal_flow_spice_lower_discrete.py` — the exact-card-text unit tests
  plus real-ngspice integration tests to mirror for a new block type.
- the block-diagram palette catalogue (clean-room analysis notes, not tracked here) — the source
  the block-diagram convention catalog every "Not started" row above is drawn from.
