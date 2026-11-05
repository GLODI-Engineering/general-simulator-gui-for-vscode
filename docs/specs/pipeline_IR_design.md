# Simulation Pipeline — Intermediate Representations & Open Design Questions

*Working document — generated from design discussion*

---

## 1. Pipeline Overview

The full pipeline has four stages. This document focuses on **Stages 1 and 2**, which are the hardest.

```
[Source Formats]
      │
      ▼
Stage 1 · Front-End Compiler   ← THIS DOCUMENT
      │  IR-1 (Topology Graph)
      │       ↓
      │  IR-1 → IR-2 Lowering
      │       ↓
      │  IR-2 (Symbolic Equation System)
      ▼
Stage 2 · Symbolic Processing  ← THIS DOCUMENT (partially)
      │  (tearing, sorting, index reduction)
      ▼
Stage 3 · Numerical DAE/ODE Solver
      ▼
Stage 4 · Post-processing / Plotting
```

---

## 2. Input Sources

The pipeline accepts four source families, each entering at a different point:

| Source | Format | Entry Point |
|---|---|---|
| SPICE netlist | `.cir`, `.net`, `.sp` | IR-1 via SPICE Parser |
| KiCad schematic | `.kicad_sch` | IR-1 via KiCad Parser |
| Own software format | Native | IR-1 via Native Parser |
| OpenModelica / sim SW | Flat equation set | IR-2 directly via Modelica Adapter |

The Modelica path bypasses IR-1 entirely because Modelica tools already perform their own compilation to a flat equation system — reconstructing component topology from that output would be the inverse problem and is not worth the effort.

---

## 3. IR-1 · Topology Graph

### Purpose

IR-1 is a **pure structural description** of the circuit or system. It knows what components exist, how they are connected, and what their parameters are. It does **not** contain any equations — all physics knowledge is deferred to the lowering stage.

### Schema

```
Graph:
  Nodes  → nets / junctions (electrical nodes, bond-graph ports, etc.)
  Edges  → component instances

Component instance:
  id         : unique name (e.g. Q1, R3, C7)
  type       : family identifier (BJT_NPN, Resistor, Capacitor, ...)
  model      : specific model name (2N2222, generic, ...)
  pins       : mapping of pin names → net node ids
  parameters : dict of numeric or symbolic parameter overrides
```

### Example — 2N2222 transistor

```
Component: Q1
  type:   BJT_NPN
  model:  2N2222
  pins:
    C → net_VCC
    B → net_base
    E → net_emitter
  parameters: {}   # all from library defaults
```

### What IR-1 deliberately excludes

- Constitutive equations
- Operating region logic
- Connection laws (KCL/KVL — generated during lowering)
- Any notion of time or derivatives

---

## 4. IR-1 → IR-2 Lowering

The lowering stage is **the most knowledge-intensive pass** in the pipeline. It performs three operations in sequence.

### 4.1 Component Model Resolution

For each component instance in IR-1:

1. Look up the model name in the **component library**
2. Select an equation level based on simulation intent (`dc_op`, `transient`, `ac`, `rf`)
3. Retrieve the symbolic equation template for that level
4. Instantiate the template: substitute net-specific variable names and bind parameter values

#### Model level selection policy

| Simulation intent | Default model level |
|---|---|
| `dc_op` | Ebers-Moll L1 / equivalent |
| `transient` | Ebers-Moll L1 or Gummel-Poon |
| `ac_small_signal` | Gummel-Poon |
| `rf` | VBIC / MEXTRAM |

#### Piecewise model rejection

If a library entry contains a piecewise (region-switched) equation set, the lowering stage must either:

- **Reject** it with an explicit error, or
- **Auto-convert** it to a smooth continuous approximation (e.g. `tanh`-based smoothing)

Piecewise models introduce discontinuities that turn the DAE into a hybrid system. This is a qualitatively harder problem for both symbolic processing and numerical solving. **Mandate smooth continuous models at IR-2 level.**

### 4.2 Connection Law Generation

After expanding component equations, the lowering stage generates the **connection laws** at every net node:

- **KCL** (Kirchhoff's Current Law) for electrical nets: sum of currents at each node = 0
- Bond-graph equivalent for multi-domain systems
- Ground / reference node declarations

### 4.3 Variable Namespace

All variables in IR-2 must be **unambiguously namespaced** per component instance. Recommended convention:

```
V_BE__Q1    # voltage V_BE belonging to instance Q1
I_C__Q1     # current I_C belonging to instance Q1
V__net_base # absolute potential of net net_base
```

This scheme must be agreed upon before building any parser or template, as it propagates through the entire pipeline into solver variable tables.

---

## 5. IR-2 · Symbolic Equation System

### Purpose

IR-2 is a **flat, source-agnostic set of symbolic equations** ready for structural analysis. It is the convergence point for all input paths. The symbolic processing stage sees only IR-2 and nothing upstream.

### Schema

```
EquationSystem:
  variables  : list of symbolic unknowns (with type: algebraic | differential)
  parameters : list of known numeric or symbolic constants
  equations  : list of symbolic equations (implicit form: f(...) = 0)
  derivatives: set of (variable, wrt) pairs that appear — determines DAE index
```

### Equation representation

Equations are stored as **symbolic expression trees**, not strings. This is non-negotiable — symbolic processing (tearing, index reduction) requires algebraic manipulation, not text processing.

Recommended backend: **SymPy** expression trees, or an equivalent IR that can be losslessly converted to SymPy.

### Example — Q1 (2N2222, Ebers-Moll L1) contribution to IR-2

```
# Parameters (numeric, from library)
I_S  = 1.4e-14
β_F  = 200
β_R  = 6
n_F  = 1.0
V_T  = 0.02585   # at 300K

# Voltage definitions (from net assignments)
V_BE__Q1 = V__net_base - V__net_emitter
V_BC__Q1 = V__net_base - V__net_VCC

# Constitutive equations (Ebers-Moll)
I_C__Q1 = I_S * (exp(V_BE__Q1 / (n_F * V_T)) - 1)
         - (I_S / β_R) * (exp(V_BC__Q1 / (n_R * V_T)) - 1)

I_B__Q1 = (I_S / β_F) * (exp(V_BE__Q1 / (n_F * V_T)) - 1)
         + (I_S / β_R) * (exp(V_BC__Q1 / (n_R * V_T)) - 1)

# KCL at Q1 terminals
I_C__Q1 + I_B__Q1 + I_E__Q1 = 0

# KCL at each net (generated by connection law stage)
I_C__Q1 + I__R_load = 0        # at net_VCC
I_B__Q1 - I__R_base = 0        # at net_base
I_E__Q1 - I__R_emitter = 0     # at net_emitter
```

---

## 6. Component Library

### Role

The component library is queried during lowering. It is **not** a flat file — it is a structured registry that maps model names to parameter sets and equation templates.

### Entry schema

```yaml
id: 2N2222
family: BJT_NPN
parameters:
  I_S:   1.4e-14
  beta_F: 200
  beta_R: 6
  n_F:   1.0
  n_R:   1.0
  V_AF:  74.1       # Early voltage (Gummel-Poon and above)
models:
  level_1: ebers_moll_l1    # reference to equation template
  level_2: gummel_poon      # reference to equation template
  default: level_1
```

### Equation templates

Templates are **parameterized symbolic functions**, not strings. They take:
- A dict of net-to-variable bindings
- A dict of parameter values

And return a list of symbolic equations ready to be appended to IR-2.

### Open question — library ownership

> **Q1**: Who owns and extends the component library?
>
> Options:
> - **Bundled only** — ship a fixed library, like SPICE `.lib` files
> - **User-extensible** — users can register custom models via a defined schema
> - **Hybrid** — bundled core library + user extension directory
>
> The hybrid approach is almost certainly correct, but it introduces validation: user-supplied templates must be checked for continuity and symbolic well-formedness before being accepted.

---

## 7. Open Design Questions

The following questions must be resolved before implementation begins. They are ordered by how many downstream decisions they block.

---

### Q1 — Variable naming convention (IR-2)

> What is the exact namespacing scheme for variables in IR-2?

This affects every parser, every equation template, the symbolic processor, and the solver interface. It must be decided first and never changed.

**Candidate:** `<quantity>__<instance_id>` for component-local variables, `V__<net_id>` for net potentials.

---

### Q2 — Equation representation format

> Are IR-2 equations stored as SymPy expression trees, a custom AST, or another format?

The symbolic processing stage (tearing, sorting, Pantelides index reduction) requires algebraic manipulation. String-based representations are not viable. The choice of symbolic backend propagates into every downstream tool.

**Candidate:** SymPy as the canonical representation, with serialisation to a portable format (e.g. JSON-encoded expression tree) for storage and interop.

---

### Q3 — Component library ownership and extensibility

> Is the component library bundled, user-extensible, or hybrid?

See Section 6. The answer determines how users bring in proprietary or exotic component models.

---

### Q4 — Simulation intent declaration

> Where and how does the user declare simulation intent (`dc_op`, `transient`, `ac`, etc.)?

This drives model level selection during lowering. It could live at the top of the source file, as a separate run configuration, or as a parameter passed to the pipeline CLI/API.

---

### Q5 — Multi-domain support in IR-1 and IR-2

> Are IR-1 and IR-2 domain-agnostic from the start, or electrical-first with mechanical/thermal added later?

Bond-graph or effort/flow generalisation of KCL/KVL would make both IRs domain-agnostic. Starting electrical-only is faster but risks baking in electrical assumptions that are hard to remove later.

---

### Q6 — Piecewise model policy

> Reject piecewise models at the library validation stage, or auto-convert?

Auto-conversion is user-friendly but risky — a bad smoothing approximation silently changes simulation results. Rejection is safe but requires users to supply continuous models. A hybrid (reject with a suggested continuous alternative) may be the best path.

---

## 8. Legacy Code Integration

Users may supply component models or subsystems implemented in **C, C++, a numerical computing environment/Octave, or Python** rather than as symbolic equations. This is a first-class requirement, not an edge case — real engineering workflows are full of validated legacy code that must not be rewritten.

Plugging opaque code into a symbolic pipeline creates fundamental tensions that cannot be wished away. This section defines the **minimum contract** an external function must satisfy to be admitted into the pipeline, and documents the consequences for IR-2, symbolic processing, and the solver.

---

### 8.1 The Core Tension

The pipeline is built on the assumption that equations are **symbolically manipulable**. Legacy code breaks this assumption in three specific ways:

| Pipeline capability | Symbolic equation | Opaque external function |
|---|---|---|
| Structural analysis (incidence matrix) | Full — every variable visible | Partial — only declared I/O visible |
| Index reduction (Pantelides) | Full — can differentiate symbolically | **Blocked** — cannot differentiate opaque code |
| Jacobian generation | Automatic, exact | Must be supplied, approximated, or instrumented |
| Causality flexibility | High — equation can often be inverted | **Fixed** — function evaluable in one direction only |

The contract below specifies what the user must declare so the pipeline can work around these limitations safely.

---

### 8.2 The External Function Block — IR-2 Extension

IR-2 must support a second equation kind alongside symbolic expressions: the **ExternalFunctionBlock**. It is not an equation — it is a typed, declared interface to opaque code.

```
ExternalFunctionBlock:
  id              : unique instance name (e.g. ext__MyMotor)
  language        : c | cpp | python | octave
  entry_point     : function name or file path + function name
  inputs          : ordered list of (variable_name, unit)
  outputs         : ordered list of (variable_name, unit)
  parameters      : dict of compile-time numeric constants passed at init
  causality       : fixed — inputs must be known to evaluate outputs
  has_state       : bool — does the function maintain internal memory?
  state_size      : int — number of internal state variables (if has_state = true)
  derivatives     : see Section 8.3
  time_dependence : explicit | none  — does the function take t as an argument?
```

The incidence matrix used by symbolic processing sees only the declared `inputs` and `outputs`. The internals are invisible. This is sufficient for sorting and tearing — but not for index reduction (see Section 8.5).

---

### 8.3 Derivative Contract — The Hardest Requirement

Every DAE/ODE solver needs Jacobians. For symbolic equations the pipeline generates them analytically. For external functions, the user must choose one of three **derivative modes**, declared explicitly in the block:

#### Mode A — Analytical derivatives supplied by user (preferred)

The user provides a second function implementing the Jacobian of outputs with respect to inputs.

```
derivatives:
  mode: analytical
  jacobian_entry_point: MyMotor_jac   # same language, same file
```

This is the most efficient and most accurate. It is also the highest burden on the user. Require it for C/C++ functions where performance matters.

#### Mode B — Automatic differentiation (language-dependent)

The pipeline instruments the user's code and differentiates it automatically.

```
derivatives:
  mode: auto_diff
```

**Viable for Python** — libraries like JAX or `jax.grad` can differentiate Python functions with minimal constraints (no arbitrary I/O, no print statements in the hot path, numpy-compatible operations only). The pipeline wraps the user's function in a JAX-compatible harness automatically.

**Not viable for compiled C/C++** without source-level AD tools (Tapenade, ADOL-C), which require the pipeline to recompile the user's code — a significant integration burden. Do not promise this for C/C++ in the first version.

**Not viable for a numerical computing environment/Octave** in general. Symbolic toolboxes exist but are not reliable for arbitrary functions.

#### Mode C — Finite difference approximation (fallback)

The pipeline approximates the Jacobian numerically.

```
derivatives:
  mode: finite_difference
  step_size: 1e-7   # optional override
```

Always works. Always introduces approximation error. Can cause solver convergence problems for stiff systems or poorly scaled variables. Must be the explicit choice of the user, not a silent fallback — **the pipeline must warn loudly if this mode is selected**.

---

### 8.4 Causality Constraint

A symbolic equation `f(x, y) = 0` can in principle be solved for either `x` or `y` depending on what the rest of the system needs. An external function `y = f(x)` can only be evaluated left-to-right — `x` must be known to get `y`.

This means **the causality of an external block is fixed at declaration time** and cannot be changed by the symbolic processor during tearing and sorting. The declared `inputs` must always be computed before the block is evaluated.

This is a hard constraint on the tearing algorithm. The symbolic processor must:

1. Treat external block inputs as **must-be-known** variables — they cannot be selected as tear variables unless an algebraic loop can be resolved around them.
2. Detect and reject (with a clear error) any system configuration where an external block's inputs depend on its own outputs without an explicit algebraic loop solver in between.

**Practical implication for users:** if legacy code implements a model where the output feeds back into the input within the same time step (an implicit relationship), the user must either restructure the code or declare the block as having an explicit iteration interface — which is a more advanced contract not required in the first version.

---

### 8.5 Stateful External Functions

A function that maintains internal memory (e.g. a motor controller with an integrator, a filter with state registers) breaks the assumption that the equation system is fully described by IR-2's variable list.

If `has_state = true`, the block must additionally declare:

```
state_interface:
  init_entry_point : MyMotor_init    # called once at t=0
  step_entry_point : MyMotor_step    # called at each solver step
  state_size       : 4               # pipeline allocates state vector
```

The pipeline allocates a state buffer and passes it by pointer (C/C++) or by reference (Python/a numerical computing environment) at every call. The solver treats the state as additional differential variables, **but cannot reason about them symbolically** — they are invisible to the incidence matrix.

**Critical consequence:** a stateful external block that introduces differential equations of index > 1 will cause the solver to fail with no way for the pipeline to detect or fix it ahead of time. The pipeline must document this clearly and emit a warning whenever a stateful block is present.

---

### 8.6 Language Binding Strategy

The solver back-end runs in a specific execution environment. Calling across language boundaries at every solver step has real cost. The binding strategy per language:

| Language | Binding mechanism | Derivative support | Performance |
|---|---|---|---|
| C | Direct FFI — compile to shared library, call via `ctypes` or native linker | Analytical only (v1) | Excellent |
| C++ | Same as C via `extern "C"` wrapper | Analytical only (v1) | Excellent |
| Python | Direct call if solver is Python-based; subprocess or embedded interpreter otherwise | Analytical or JAX auto-diff | Good (Python solver) / Poor (C solver) |
| a numerical computing environment/Octave | Engine API or subprocess call | Analytical only | Poor — avoid for inner loops |

**Recommendation for v1:** support C and Python natively. Treat a numerical computing environment/Octave as a pre-compilation target — the user is encouraged to export their a numerical computing environment function to a C MEX file or Python equivalent before registering it. Do not attempt a live a numerical computing environment engine binding in v1.

---

### 8.7 Impact on IR-2 Schema

The IR-2 `EquationSystem` schema from Section 5 must be extended:

```
EquationSystem:
  variables         : list of symbolic unknowns (algebraic | differential)
  parameters        : list of known constants
  equations         : list of SymbolicEquation | ExternalFunctionBlock
  derivatives       : set of (variable, wrt) pairs — for symbolic equations only
  external_blocks   : list of ExternalFunctionBlock (also referenced in equations)
  has_opaque_blocks : bool — signals to symbolic processor that full index
                      reduction may not be possible
```

The `has_opaque_blocks` flag is a coarse but critical signal. When true, the symbolic processor must operate in a **degraded mode**: it can sort and tear around declared I/O boundaries, but it cannot guarantee that the resulting system has index ≤ 1 if any opaque block contributes differential terms.

---

### 8.8 Open Questions — Legacy Code

#### Q7 — Minimum viable language support for v1

> Support C + Python only in v1, with a numerical computing environment/Octave deferred?

This is strongly recommended. The binding complexity and derivative story for a numerical computing environment is disproportionate to the effort. Users with models in such an environment should be directed to export to Python (via a bridge or code generation) or to C MEX.

---

#### Q8 — Auto-diff for Python: JAX or alternative?

> If Mode B (auto-diff) is offered for Python, is JAX the required interface, or do we accept arbitrary Python and attempt instrumentation?

JAX requires the user's function to be JAX-compatible (no side effects, numpy-style operations). Accepting arbitrary Python and instrumenting it is not feasible. **Proposed policy:** Mode B for Python requires the user to declare their function as JAX-compatible; the pipeline then calls `jax.jacfwd` automatically. Non-JAX Python functions must use Mode A or Mode C.

---

#### Q9 — Stateful block index safety

> How does the pipeline communicate index-safety risk to the user when stateful external blocks are present?

At minimum: a warning at IR-2 construction time listing every stateful block and stating that their internal differential structure is invisible to the symbolic processor. A stricter policy would require stateful blocks to declare their internal DAE index explicitly — but this is a high burden and probably not right for v1.

---

#### Q10 — Algebraic loops through external blocks

> What happens when the symbolic processor detects an algebraic loop that passes through an external block?

If the loop is entirely through symbolic equations, the tearing algorithm can resolve it normally. If the loop passes through an external block, the pipeline cannot resolve it symbolically. Options: reject with an error and ask the user to break the loop externally; or insert an automatic fixed-point iteration wrapper around the loop. The fixed-point approach works but converges slowly and may not converge at all for stiff loops. **Proposed policy for v1:** reject with a clear diagnostic message identifying the loop variables and the external block involved.
