# `.gsim_sch` File Format Specification (v2)

> **Status:** authoritative. This document is the contract.
> **Supersedes:** `docs/gsim-format.md` (v1, `.gsim`).
> **Migration:** hard cutover. There is no v1 loader and no migration shim.
> **Schema:** `packages/schemas/definitions/model/gsim_sch.schema.json`
> (JSON Schema 2020-12).

The `.gsim_sch` file is the canonical serialisation format for
general-simulator schematic models from v2 onward. It is a UTF-8 JSON
document. The file extension `.gsim_sch` ("schematic") replaces the v1
extension `.gsim`.

---

## Table of contents

1. [Design goals](#1-design-goals)
2. [File identification](#2-file-identification)
3. [Top-level structure](#3-top-level-structure)
4. [Model object](#4-model-object)
5. [Parameter table (`params`)](#5-parameter-table-params)
6. [Block object](#6-block-object)
7. [Wire object](#7-wire-object)
8. [Port-kind catalogue](#8-port-kind-catalogue)
9. [Net naming](#9-net-naming)
10. [Goto / From](#10-goto--from)
11. [Subsystems and hierarchy](#11-subsystems-and-hierarchy)
12. [Annotations (`lines`)](#12-annotations-lines)
13. [Simulation directives (`simulation`)](#13-simulation-directives-simulation)
14. [Fidelity tiers](#14-fidelity-tiers)
15. [Block type catalogue](#15-block-type-catalogue)
16. [Compilation pipeline](#16-compilation-pipeline)
17. [Validation rules](#17-validation-rules)
18. [v2 limitations](#18-v2-limitations)
19. [Validation errors quick reference](#19-validation-errors-quick-reference)

---

## 1. Design goals

The v2 format is shaped by four hard requirements that v1 could not meet:

| # | Requirement | Mechanism |
|---|---|---|
| D1 | A single file is the **single source of truth** for the model. Visual editor and any textual/programmatic view must round-trip losslessly. | Canonical key ordering; integer coordinates; explicit waypoints; named nets. |
| D2 | Two component paradigms coexist: **signal-flow** (causal block diagrams) and **physical-network** (acausal, conserving-port). | Port-kind tagging on every port; `paradigm` field on every block; explicit converter blocks between paradigms. |
| D3 | The same physical concept exists at **three fidelity tiers** (ideal, behavioural, SPICE-parameterised). The user can swap tiers without re-wiring. | Separate `fidelity` field; equation templates keyed by `(type, fidelity)`. |
| D4 | The file holds everything needed to **reproduce a run**: topology, parameters, ICs, simulation directives, solver tolerances. | Top-level `params` table; top-level `simulation` block with a list of analyses. |

Secondary goals:

- **Locale-independent.** No floats in coordinates; no platform-dependent path separators in source-of-truth fields.
- **Git-diffable.** Canonical key order; one block/wire/line/param per line in pretty-printed output.
- **Hierarchy-native.** Subsystems are first-class. Hierarchy navigation does not depend on external files.
- **Forward-compatible.** Block catalogues, port kinds, and fidelity tiers are versioned through the schema; new entries do not require a `schema_version` bump.

---

## 2. File identification

| Property | Value |
|---|---|
| Extension | `.gsim_sch` |
| MIME (suggested) | `application/x-gsim-sch+json` |
| Encoding | UTF-8, no BOM |
| Indentation (writer) | 2 spaces |
| Line endings (writer) | `\n` (LF), regardless of host platform |
| Key ordering | Canonical (see §17.4) |

The first non-whitespace bytes of every valid file are `{"schema_version":2` so a stream-aware loader can detect the format without parsing the whole document.

---

## 3. Top-level structure

```json
{
  "schema_version": 2,
  "model": { ... }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | integer | yes | Must be `2`. The v2 loader rejects any other value. There is no v1 reader. |
| `model` | object | yes | See §4. |

The loader at `packages/simulator/src/simulator/compiler/gsim_sch_loader.py` accepts a file path, a JSON string, or an already-parsed dict.

---

## 4. Model object

```json
{
  "id": "rc-low-pass",
  "name": "RC Low-Pass Filter",
  "role": "schematic",
  "grid": 10,
  "params": [ ... ],
  "blocks": [ ... ],
  "wires":  [ ... ],
  "lines":  [ ... ],
  "nets":   [ ... ],
  "simulation": { ... },
  "metadata": {}
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (non-empty) | yes | Stable identifier; used as the simulation ID seed. Must match `^[A-Za-z][A-Za-z0-9_-]*$`. |
| `name` | string (non-empty) | yes | Human-readable display name. |
| `role` | `"schematic" \| "library"` | no | Document role. Absent means `"schematic"`. Top-level model only — meaningless inside a subsystem. See §4.1. |
| `grid` | integer ≥ 1 | yes | Canvas grid pitch in pixels. Does not affect simulation. |
| `params` | Param[] | yes | Model-scoped parameter table. May be empty `[]`. See §5. |
| `blocks` | Block[] | yes | May be empty `[]`. See §6. |
| `wires` | Wire[] | yes | May be empty `[]`. See §7. |
| `lines` | Annotation[] | yes | May be empty `[]`. Freeform canvas annotations. See §12. |
| `nets` | Net[] | yes | User-named nets. May be empty `[]`. See §9. |
| `simulation` | object | yes | Simulation directives. May be `{}` for models that are not directly runnable. See §13. |
| `metadata` | object | yes | Free-form key/value bag. `{}` when unused. Solver/writer must round-trip unknown keys untouched. |

The model object is **also** the shape used recursively inside a subsystem (§11). At the subsystem level only, the optional fields `ports`, `parent_param_aliases` may appear; see §11. Conversely `role` (§4.1) is a **top-level-only** field.

### 4.1 Document role (`role`)

A `.gsim_sch` file is used for more than one purpose. Before `role` there was no structural way to tell a schematic meant to be opened and simulated apart from a file that only exists to be copied out of, so every consumer had to guess from the contents (dangling ports? no `simulation` block? mostly `subckt_defs`?). `role` states the author's intent explicitly.

| Value | Meaning |
|---|---|
| `"schematic"` | A top-level design, meant to be opened, edited, and simulated directly. **Default when `role` is absent.** |
| `"library"` | Reusable content, not a runnable design: a fixed-position pre-wired *stamp* to be copied into a parent schematic, and/or a carrier for reusable definitions (the schema's `subckt_defs` list). |

```json
{
  "schema_version": 2,
  "model": {
    "id": "h-bridge-3phase",
    "name": "3-Phase H-Bridge (stamp)",
    "role": "library",
    "grid": 10,
    "params": [],
    "blocks": [ ... six switches, pre-wired, with dangling boundary ports ... ],
    "wires":  [ ... ],
    "lines":  [],
    "nets":   [],
    "simulation": {},
    "metadata": {}
  }
}
```

**`role` is a hint about intent, not a structural constraint.** It neither adds nor relaxes any rule in §17. A `"library"` document is validated exactly like a `"schematic"` one: the same required fields, the same catalogue and port checks, the same param resolution. In particular `role` does **not** assert that a stamp has dangling ports, and it does not permit a `"schematic"` document to omit them. Every structural rule stays where it is.

What changes is what tooling should *do* with the file:

- A `"library"` document should not be offered for direct simulation. A frontend surfaces it in a library browser rather than as an ordinary schematic tab; a batch runner skips it.
- A `"schematic"` document behaves exactly as it always has. Because the field is optional and defaults to `"schematic"`, every existing `.gsim_sch` file remains valid and unchanged in meaning.

Fields that become advisory under `role: "library"`:

| Field | Behaviour in `"library"` mode |
|---|---|
| `simulation` | **Still allowed and still validated** per §13 and §17.5 — a stamp extracted from a working schematic legitimately carries the analyses it was cut from. But it is advisory: no consumer may auto-run a library document, and `simulation.default_analysis` has no addressee. Authors who want no ambiguity should write `{}`. |
| `nets` (`is_reference`) | A stamp is a fragment, so it commonly declares no reference net. The compiler's heuristic reference selection (§9) is not applied to a library document, because it is never compiled on its own. |
| everything else (`id`, `name`, `grid`, `params`, `blocks`, `wires`, `lines`, `metadata`, `subckt_defs`) | Unchanged. These are the payload. |

Nothing is *ignored on load* — the loader round-trips the whole document either way. "Advisory" here means "no runtime consumer acts on it," never "the writer may drop it."

**Validation**

- If present, `role` must be exactly `"schematic"` or `"library"`. Any other value is a hard error at load (`Invalid model role`).
- `role` may appear only on the top-level model. A nested `subsystem` model that carries `role` is rejected by the schema as an additional property.
- Absent `role` is not an error and is not rewritten on save; a writer emits `role` only if the loaded document carried it.

---

## 5. Parameter table (`params`)

The `params` table is the model-scoped equivalent of SPICE `.PARAM`. Block parameters may reference named parameters by name; values may be expressions.

```json
"params": [
  { "name": "Rload",  "value": 1000,    "unit": "Ohm",   "doc": "Load resistor" },
  { "name": "Vcc",    "value": 5.0,     "unit": "V" },
  { "name": "Rseries","value": "{Rload * 0.1}", "unit": "Ohm" },
  { "name": "Tend",   "value": 5e-3,    "unit": "s" }
]
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Matches `^[A-Za-z_][A-Za-z0-9_]*$`. Unique within the table. Case-sensitive. |
| `value` | number \| expression | yes | Number or expression string (see §5.1). |
| `unit` | string | no | Free-form unit label. Display-only in v2; no unit checking. |
| `doc` | string | no | One-line documentation shown in the parameter editor tooltip. |

### 5.1 Value forms

A param `value` is one of:

| Form | Example | Notes |
|---|---|---|
| Numeric literal | `1000`, `1.5e-6`, `-0.25` | Stored as JSON number. |
| Expression string | `"{Rload * 2}"` | Matches `^\{.+\}$`. Evaluated by the loader (see §5.2). |
| Reference string | `"Rload"` | Matches `^[A-Za-z_][A-Za-z0-9_]*$`. Resolves to another param's value. |

A block param (see §6) accepts the same three forms. This makes any value position parameterisable.

### 5.2 Expression evaluation

The loader evaluates expression strings against the resolved `params` table using a restricted Python-like expression grammar:

- Operators: `+ - * /` (and `**` for power), unary `+ -`, grouping `( )`.
- Functions: `sin`, `cos`, `tan`, `exp`, `log`, `log10`, `sqrt`, `abs`, `min`, `max`, `pow`.
- Constants: `pi`, `e`.
- Identifiers resolve to other `params[*].name` entries.

There is **no** support for: attribute access, subscripts, comparisons, conditionals, string ops, function definitions, or bare `__` identifiers.

A `params` table is well-formed iff its dependency graph (param-X references param-Y) is a DAG. The loader topologically resolves; cycles are rejected with a clear error.

### 5.3 Use sites

Param names may appear in:

- Block parameter values: `"params": { "R": "Rload" }` or `"R": "{Rload * 2}"`.
- Initial conditions in `simulation.initial_conditions[*].value`.
- Analysis directives: any numeric field (sweep start/stop, t_end, t_step) accepts an expression or reference.
- Subsystem `parent_param_aliases` (§11.5).

Param names do **not** appear in coordinate fields (`position`, `waypoints`), net names, ids, or visual style fields. Coordinates remain integer literals.

---

## 6. Block object

```json
{
  "id": "r1",
  "type": "physical-electrical.passive.resistor",
  "paradigm": "physical-network",
  "domain": "physical-electrical",
  "fidelity": "ideal",
  "position": [100, 200],
  "rotation": 0,
  "mirror": "none",
  "params": { "R": "Rload" },
  "ic":     { },
  "label":  "R1",
  "subsystem": null
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (non-empty) | yes | Unique across the model **and all nested subsystems**. Matches `^[A-Za-z][A-Za-z0-9_-]*$`. |
| `type` | string | yes | Dot-separated namespace; see §6.1 and §15. Pattern: `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`. |
| `paradigm` | enum | yes | One of `signal-flow`, `physical-network`, `converter`, `hierarchy`, `routing`, `annotation`. See §6.2. |
| `domain` | enum | yes | A port-kind value (see §8). For multi-domain blocks (converters), the **primary** domain. |
| `fidelity` | enum | yes | One of `ideal`, `behavioral`, `spice`, or `n_a`. See §14. Most signal-flow and routing blocks use `n_a`. |
| `position` | `[int, int]` | yes | Canvas grid coordinates. **Floats are rejected.** |
| `rotation` | `0 \| 90 \| 180 \| 270` | yes | Degrees clockwise. |
| `mirror` | `"none" \| "x" \| "y"` | yes | Flip axis, or `"none"`. |
| `params` | object | yes | Type-specific parameter bag. Values may be numeric, expression, or param-reference (§5.1). `{}` when the type has no parameters. |
| `ic` | object | yes | Initial condition bag. `{}` when none. Keys are block-internal state names (e.g. `v`, `i`, `x`). Values follow §5.1. |
| `label` | string | no | Free-form display label. Defaults to `id` when absent. |
| `subsystem` | Model \| null | no | Only meaningful when `type` is `hierarchy.subsystem.*`. See §11. |

### 6.1 Type namespace

The `type` field uses a structured namespace. The first segment partitions the catalogue; deeper segments refine it.

```
<paradigm-root>.<category>.<kind>[.<variant>]
```

| `paradigm-root` (first segment) | Meaning |
|---|---|
| `signal-flow`         | Causal signal-flow blocks (math, continuous, discrete, logic, lookup, source, sink). |
| `physical-electrical` | Acausal electrical network components (resistor, capacitor, diode, mosfet, …). |
| `physical-translational` | Acausal mechanical-translational network components (mass, spring, damper, …). |
| `physical-rotational` | Acausal mechanical-rotational network components (inertia, spring, damper, …). |
| `physical-thermal`    | Acausal thermal network components (thermal mass, thermal resistance, …). |
| `converter`           | Cross-paradigm or cross-domain converters (signal ↔ physical, electrical ↔ rotational, …). |
| `hierarchy`           | Subsystem container, inport, outport. |
| `routing`             | Goto, From, Mux, Demux, BusCreator, BusSelector. |
| `annotation`          | Block-shaped annotations (rare; most annotations live in `model.lines`). |

The full enumerated catalogue is §15. Adding new types requires updating the block-metadata schema (`packages/schemas/definitions/blocks/block-metadata.schema.json`), not the `.gsim_sch` schema.

### 6.2 `paradigm` field

`paradigm` is **derived** from `type`: it duplicates information already encoded in the first segment of the type. It is stored explicitly so that:

- Loaders and UI code do not need to keep an in-process map from type prefix to paradigm.
- Cross-paradigm wiring rules (§8.3) can be checked without consulting the catalogue.

The loader enforces consistency: `paradigm` must match the type prefix according to the table above. A mismatch is a hard validation error.

### 6.3 `domain` field

`domain` is the **primary port-kind** carried by the block. Examples:

| Block | `paradigm` | `domain` |
|---|---|---|
| `signal-flow.math.gain` | `signal-flow` | `signal` |
| `physical-electrical.passive.resistor` | `physical-network` | `physical-electrical` |
| `converter.signal-to-physical-electrical` | `converter` | `physical-electrical` (output side) |
| `hierarchy.subsystem.atomic` | `hierarchy` | `mixed` |

For blocks with ports of mixed kinds (converters, sensors with conserving in-line ports + a signal output, subsystems), `domain` records the dominant or output-side kind; the per-port `kind` (in the block catalogue, not in `.gsim_sch`) is authoritative.

### 6.4 `fidelity` field

One of `ideal`, `behavioral`, `spice`, or `n_a` (not applicable). See §14 for the full semantics.

`fidelity` may be swapped in place without changing `id`, `position`, `wires`, or surrounding topology — provided the new fidelity's port shape matches the old one. The frontend exposes "Change fidelity" on every block whose catalogue entry declares ≥ 2 tiers.

### 6.5 `ic` (initial conditions)

Per-block ICs replace v1's ad-hoc `IC` param keys (`capacitor.params.IC`, `inductor.params.IC`). The `ic` bag is a flat map from a block-internal state variable name to a value (§5.1).

```json
"ic": { "v": 0.0, "i": 1.5 }
```

Block catalogues declare which state names are accepted; unknown keys are rejected by the loader. ICs may also be set at the model level via `simulation.initial_conditions` (§13.4); when both are present, the model-level entry wins (with a warning).

---

## 7. Wire object

```json
{
  "id": "w1",
  "from": { "block": "v1", "port": "p" },
  "to":   { "block": "r1", "port": "p" },
  "waypoints": [[10, 0], [10, 20]],
  "pinned": false,
  "net":    "vin",
  "kind":   "physical-electrical",
  "label":  null
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (non-empty) | yes | Unique within the model and all nested subsystems. |
| `from` | Endpoint | yes | Source block+port. See §7.1. |
| `to` | Endpoint | yes | Destination block+port. |
| `waypoints` | `[int,int][]` | yes | Orthogonal polyline control points. **Each waypoint must be integer-valued.** `[]` for straight wires. |
| `pinned` | boolean | yes | Whether the router locks waypoints. `false` for auto-routed wires. |
| `net` | string \| null | yes | Optional user-defined net label (e.g. `"VCC"`). `null` for unlabeled. See §9. |
| `kind` | enum | yes | Port-kind carried by the wire. Loader validates against the endpoint kinds (§8.4). |
| `label` | string \| null | no | Optional inline signal label drawn at the wire midpoint. |

### 7.1 Endpoint

```json
{ "block": "<block_id>", "port": "<port_id>" }
```

`port` matches the port id declared in the block's catalogue entry (e.g. `p`, `n`, `in0`, `out`, `G`, `D`, `S`).

Wires are undirected at the schema level. The compiler treats `from`/`to` symmetrically when building nets for acausal domains. For causal signal-flow wires, `from` is the source (output port), `to` is the sink (input port); this is checked at validation (§17.2).

### 7.2 Waypoints

Waypoints describe the polyline path a wire takes between its endpoints. The router enforces orthogonality: every segment is purely horizontal or purely vertical. The format requires:

- All waypoints are integer pairs.
- Consecutive waypoints (and the endpoints) differ in exactly one axis.
- An empty `waypoints` array means the wire is a straight line between endpoints (which must themselves be orthogonal-aligned, or the router inserts an L-shape at render time).

When `pinned = true`, the router treats the listed waypoints as fixed and routes around block moves by adjusting only the unpinned segments adjacent to the moved endpoint.

### 7.3 Signal-dimension propagation

Signal-flow wires carry typed dimensions (scalar `[1]`, vector `[N]`, matrix `[M, N]`, or higher-rank). Dimensions are **inferred at load time**; they are never persisted in the file (so save/load is byte-stable regardless of inference state).

#### Block port dim signatures

Every signal-flow port declares one of three signatures in the catalogue:

| Signature | Meaning |
|---|---|
| `[N]` (literal) | The port has a fixed dimension. Example: `signal-flow.lookup.table_1d.in` is always `[1]`. |
| `inherit` | The port adopts the dimension of the wire driving it (input) or another port on the same block (output). |
| `from(<port_id>)` | The port adopts the dimension of a sibling port on the same block, possibly transformed (e.g. `from(in) * 2`). |

Example signatures:

| Block | Port signatures |
|---|---|
| `signal-flow.math.gain`               | `in: inherit`, `out: from(in)` |
| `signal-flow.math.sum`                | `in0..inN: inherit, all-equal`, `out: from(in0)` |
| `signal-flow.math.dot_product`        | `in0: [N]`, `in1: [N]`, `out: [1]` |
| `routing.mux`                         | `in0..inN: inherit`, `out: sum(in*)` |
| `routing.demux`                       | `in: [N]`, `out0..outM: partition(in, outputs)` |
| `routing.bus_creator`                 | `in0..inN: inherit`, `out: bus(elements)` |
| `signal-flow.attributes.signal_specification` | `in: inherit`, `out: from(in) constrained to params.dim` |
| `signal-flow.source.constant`         | `out: shape(params.value)` |

#### Inference algorithm

```
1. Seed: every wire's dim ← unknown.
2. Sources push their declared dims forward.
3. Repeat until fixed point:
   a. For each block with all-input dims known, resolve its output dims.
   b. Check that `inherit, all-equal` groups agree; raise DimensionMismatchError on disagreement.
   c. Honour Signal Specification constraints; raise DimensionMismatchError on conflict.
4. Wires reaching fixed point with dim still unknown → DimensionUnresolvedError.
5. Algebraic loops between dim-inheriting blocks → DimensionLoopError (cycle path named).
```

The pass runs once per `gsim_sch_loader.load()` call, after structural validation and before IR-1 build.

#### Wire `dim` (runtime, not persisted)

After inference, each signal-flow `IR1Connection` carries a `dim: list[int]` field. Acausal wires carry `dim = None`. The IR-1 connection schema (BE-31) is the canonical surface; on-disk wires never store a dim — the inference pass re-derives it on every load.

#### Canvas annotation

When the user enables `View → Signal dimensions`, the canvas renders each signal-flow wire's inferred dim as a small label near the source port (e.g. `[1]`, `[3]`, `[2×3]`). Unresolved wires render as `[?]` with a tooltip pointing at the root-cause block.

#### Acausal wires

Acausal physical wires (`physical-electrical`, `physical-translational`, `physical-rotational`, `physical-thermal`) do not carry a dim — their across and through variables are scalar at each node. The inference pass skips them.

---

## 8. Port-kind catalogue

Every port on every block has a **port-kind**. Wires inherit the kind from their endpoints; cross-kind connections are rejected at wire-draw time (UI) and at load time (schema).

| Kind | Through variable | Across variable | Causality | Notes |
|---|---|---|---|---|
| `signal` | — | scalar / vector / matrix | causal | Default signal-flow port. |
| `signal-bus` | — | named struct of `signal` | causal | Bundled named signals (BusCreator / BusSelector). |
| `function-call` | — | discrete event | event | Function-call subsystem trigger. |
| `physical-electrical` | current (A) | voltage (V) | acausal | Conserving electrical port. |
| `physical-translational` | force (N) | velocity (m/s) | acausal | Conserving mechanical translational port. |
| `physical-rotational` | torque (N·m) | angular velocity (rad/s) | acausal | Conserving mechanical rotational port. |
| `physical-thermal` | heat flow (W) | temperature (K) | acausal | Conserving thermal port. |
| `physical-signal` | — | scalar | causal, physical-valued | Sensor output / actuator input (bridges between acausal network and signal-flow). |
| `mixed` | — | — | — | Subsystem/composite port whose kind is the concatenation of its boundary blocks' kinds. |
| `reserved.physical-magnetic` | mmf (A) | flux (Wb) | acausal | Schema-reserved for v3. No blocks ship in v2. |
| `reserved.physical-hydraulic` | volumetric flow (m³/s) | pressure (Pa) | acausal | Schema-reserved for v3. No blocks ship in v2. |
| `reserved.physical-fluid` | mass flow (kg/s) | pressure (Pa) | acausal | Schema-reserved for v3. No blocks ship in v2. |

### 8.1 Compatibility rules

A wire is valid iff:

1. `from.port.kind == to.port.kind` (modulo `signal-bus` matching by element names), **or**
2. one of the endpoints is a subsystem `mixed` port whose internal binding is the other endpoint's kind, **or**
3. the two endpoints are a `Goto` / `From` pair with the same tag (§10) — kind is then enforced between the Goto's input and the From's output.

`reserved.*` kinds may appear in port catalogues but block instances using them are rejected by the loader in v2.

### 8.2 Direction rules (signal-flow)

For `signal`, `signal-bus`, `function-call`, and `physical-signal` ports:

- A wire must have exactly one output endpoint and at least one input endpoint.
- Fan-out (one output → many inputs) is allowed.
- Fan-in is **forbidden at the schema level**. Convergent conditional signals require a `routing.merge` block.

For acausal `physical-*` ports: no direction; both endpoints participate in the same conservation law. Any block-port combination is allowed if kinds match.

### 8.3 Cross-paradigm boundary

A `signal` wire and a `physical-electrical` wire cannot connect directly. The connection must pass through a `converter.signal-to-physical-electrical` block (or its inverse). Cross-paradigm wires are rejected:

- At wire-draw time by the canvas (immediate red-X feedback; see frontend-spec §11).
- At load time by the schema (kinds must match).
- At IR-1 build by the compiler (final defence).

### 8.4 Wire `kind` field

The wire's `kind` field duplicates the kind of its endpoints. It is stored to allow:

- Pure-syntactic schema validation without consulting the block catalogue.
- Display of wire colour by kind without traversing endpoints.

The loader checks that `wire.kind == from.port.kind == to.port.kind` and emits a clear error on mismatch.

---

## 9. Net naming

v1 had no user-defined nets: net names were chosen by the compiler heuristically. v2 fixes this.

```json
"nets": [
  { "name": "VCC",  "kind": "physical-electrical", "scope": "global" },
  { "name": "GND",  "kind": "physical-electrical", "scope": "global", "is_reference": true },
  { "name": "vout", "kind": "physical-electrical", "scope": "local"  }
]
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Net label. Matches `^[A-Za-z_][A-Za-z0-9_]*$`. Unique per scope. |
| `kind` | enum | yes | Port-kind of the net. All wires assigned this net must have matching `kind`. |
| `scope` | enum | yes | `global` (visible across all subsystems) or `local` (current sheet only). |
| `is_reference` | boolean | no | When `true`, this net is the reference node for its kind. Default `false`. There must be exactly one reference net per connected acausal sub-network. |

A wire is assigned to a named net by setting `wire.net = "<net.name>"`. Multiple wires sharing the same `net` are union-found into a single electrical node at compile time. If no `is_reference` net is declared for an acausal sub-network, the compiler selects one heuristically and emits an info-level note (no longer a hard error as in v1).

---

## 10. Goto / From

Named-tag signal routing. Replaces dangling wires for global signals (clocks, enables, references, telemetry).

A `Goto` block is a **signal sink** that broadcasts its input under a tag. A `From` block is a **signal source** that emits the value broadcast under that tag.

```json
{ "id": "g_clk", "type": "routing.goto",
  "paradigm": "routing", "domain": "signal", "fidelity": "n_a",
  "position": [400, 100], "rotation": 0, "mirror": "none",
  "params": { "tag": "CLK", "visibility": "global" },
  "ic": {}
}

{ "id": "f_clk_pid", "type": "routing.from",
  "paradigm": "routing", "domain": "signal", "fidelity": "n_a",
  "position": [80, 240], "rotation": 0, "mirror": "none",
  "params": { "tag": "CLK" },
  "ic": {}
}
```

### 10.1 Tag visibility

| `visibility` | Resolution scope |
|---|---|
| `local` | Only `From` blocks in the **same subsystem** as the `Goto` may bind. |
| `scoped` | The same subsystem and all its descendants. |
| `global` | Any `From` in the entire model file. |

A `From` block does not declare a visibility; it resolves to the nearest enclosing `Goto` with a matching tag whose visibility includes the `From`'s position.

### 10.2 Tag namespace per port-kind

Tags are partitioned by port-kind. The same tag string may exist for `signal` and for `physical-signal` independently; they do not collide. Acausal kinds (`physical-electrical`, etc.) **cannot** be routed via Goto/From — those signals must be expressed through named nets (§9).

### 10.3 Validation

- Every `From` must resolve to exactly one `Goto`. Unresolved or ambiguous `From`s are hard errors at load.
- A `Goto` with no matching `From` is a warning, not an error (it may be a stub).
- Goto/From pairs participate in cycle detection at IR-1 build, the same as direct wires.

---

## 11. Subsystems and hierarchy

A subsystem is a block whose `type` starts with `hierarchy.subsystem.` and whose `subsystem` field holds a nested Model object.

### 11.1 Subsystem block shape

```json
{
  "id": "ctrl1",
  "type": "hierarchy.subsystem.atomic",
  "paradigm": "hierarchy",
  "domain": "mixed",
  "fidelity": "n_a",
  "position": [200, 100],
  "rotation": 0,
  "mirror": "none",
  "params": {},
  "ic": {},
  "label": "Controller",
  "subsystem": {
    "id": "ctrl1-body",
    "name": "Controller body",
    "grid": 10,
    "params": [],
    "blocks": [ ... including hierarchy.inport / hierarchy.outport ... ],
    "wires":  [ ... ],
    "lines":  [],
    "nets":   [],
    "simulation": {},
    "metadata": {},
    "ports": [
      { "id": "u", "direction": "in",  "kind": "signal", "boundary_block": "in_u" },
      { "id": "y", "direction": "out", "kind": "signal", "boundary_block": "out_y" }
    ],
    "parent_param_aliases": [
      { "child": "Kp", "parent": "Kp_outer" }
    ]
  }
}
```

### 11.2 Subsystem variants

| `type` | Semantics | v2 scope |
|---|---|---|
| `hierarchy.subsystem.atomic`  | Treated as a single execution unit; the solver does not fuse it with siblings. | ✓ implemented |
| `hierarchy.subsystem.virtual` | Pure grouping; flattened away at IR-1 build with no semantic effect. | ✓ implemented |
| `hierarchy.subsystem.enabled` | Executes only while its enable port is true. Carries one extra port `enable` (kind `signal`, dim `[1]`). | ✓ implemented |
| `hierarchy.subsystem.triggered` | Executes on rising / falling / either edge of its trigger port. Carries one extra port `trigger` (kind `signal`, dim `[1]`). Edge selected by `params.trigger_kind` ∈ `rising` \| `falling` \| `either`. | ✓ implemented |
| `hierarchy.subsystem.iterator` | Loops N times per parent step (`for-iterator`). | ⊘ schema-reserved; rejected by loader in v2 (requires the discrete-event scheduler — v3). |

Function-call subsystems (event-driven, fired by an upstream `signal-flow.event.function_call_generator`) are **not** in v2 scope. The `function-call` port kind is reserved (§8) but no block instantiates it in v2.

### 11.3 Boundary ports

A subsystem's external ports are declared in `subsystem.ports[]`. Each entry **must** correspond to a `hierarchy.inport` or `hierarchy.outport` block inside `subsystem.blocks`, linked by `boundary_block`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Port id used by wires drawn to the subsystem block. |
| `direction` | `"in" \| "out"` | yes | Direction as seen from the parent. |
| `kind` | port-kind enum | yes | Port-kind. May be any of §8. |
| `boundary_block` | string | yes | Id of the matching `hierarchy.inport` / `hierarchy.outport` block inside the nested model. |

### 11.4 Identifier uniqueness

Block and wire ids must be unique **across the entire file** (parent model + all nested subsystems, recursively). This makes IR-1 references unambiguous without a path prefix.

A practical convention (not enforced): id prefix matches the enclosing subsystem id (e.g. `ctrl1/pid1` becomes `ctrl1_pid1`).

### 11.5 Parameter aliasing

`subsystem.parent_param_aliases[]` binds a child param to a parent param:

```json
"parent_param_aliases": [
  { "child": "Kp", "parent": "Kp_outer" }
]
```

This makes the value of the parent's `Kp_outer` flow in as the child's `Kp` whenever a block inside the subsystem references `Kp`. Aliases are resolved before block-level expression evaluation.

### 11.6 Breadcrumb navigation

The frontend renders a breadcrumb bar showing the current edit path (e.g. `RC Plant / Controller / PID Inner`). Each crumb is a click target that opens the corresponding nested model in the canvas. There is no implicit recompile when descending or ascending; the file is the single source of truth and is patched in place.

---

## 12. Annotations (`lines`)

Annotations are non-semantic, purely visual canvas elements: text labels, freeform lines, rectangles, ellipses. They do not participate in the netlist or the IR.

```json
"lines": [
  {
    "id": "anno-text-1",
    "kind": "text",
    "position": [200, 50],
    "size": [180, 24],
    "rotation": 0,
    "text": "Filter stage 1",
    "style": { "color": "#333", "font_size": 12, "bold": false, "italic": false }
  },
  {
    "id": "anno-poly-1",
    "kind": "polyline",
    "points": [[0, 0], [100, 0], [100, 50]],
    "style": { "color": "#666", "stroke_width": 1, "stroke_style": "solid", "arrow_end": "none" }
  },
  {
    "id": "anno-rect-1",
    "kind": "rectangle",
    "position": [10, 10],
    "size": [400, 200],
    "style": { "color": "#aaa", "fill": "none", "stroke_width": 1, "stroke_style": "dashed" }
  },
  {
    "id": "anno-ellipse-1",
    "kind": "ellipse",
    "position": [100, 100],
    "size": [80, 40],
    "style": { "color": "#a00", "fill": "#fee", "stroke_width": 2, "stroke_style": "solid" }
  }
]
```

| `kind` | Required geometry | Notes |
|---|---|---|
| `text`      | `position`, `size`        | Optional `text` content. Empty string is allowed. |
| `polyline`  | `points` (≥ 2 int pairs)  | Open polyline; styled with `arrow_end`. |
| `rectangle` | `position`, `size`        | Axis-aligned. |
| `ellipse`   | `position`, `size`        | Axis-aligned bounding box. |

All numeric geometry is integer-valued. Annotations have no `paradigm`, `domain`, or `fidelity` fields — they are pure UI artefacts.

---

## 13. Simulation directives (`simulation`)

The `simulation` block holds everything needed to run the model. A single file may declare multiple analyses (e.g. an `OP` followed by a `TRAN`).

```json
"simulation": {
  "default_analysis": "tr1",
  "analyses": [
    { "id": "op1", "type": "OP" },
    { "id": "tr1", "type": "TRAN",
      "t_start": 0, "t_end": "Tend", "t_step": 1e-6,
      "uic": false },
    { "id": "ac1", "type": "AC",
      "sweep": "DEC", "n_points": 100,
      "f_start": 1, "f_end": 1e6 },
    { "id": "dc1", "type": "DC",
      "source": "v1", "start": 0, "stop": 5, "step": 0.1 },
    { "id": "tr_sweep", "type": "TRAN",
      "t_end": "Tend", "t_step": 1e-6,
      "sweeps": [
        { "param": "Rload", "values": [100, 1000, 10000] }
      ] }
  ],
  "solver": {
    "abstol": 1e-12,
    "reltol": 1e-3,
    "vntol":  1e-6,
    "method": "trap",
    "method_options": {}
  },
  "initial_conditions": [
    { "kind": "node",  "name": "vout",                "value": 0.0 },
    { "kind": "block", "block": "c1", "var": "v",     "value": 0.0 }
  ],
  "output": {
    "save_all_nodes": true,
    "save_currents": ["v1"],
    "save_block_states": []
  }
}
```

### 13.1 Analyses

Every analysis has at minimum:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Unique within the `analyses` list. Used to address the result set. |
| `type` | enum | yes | One of `OP`, `TRAN`, `AC`, `DC`, `NOISE`, `TF`. v2 supports `OP`, `TRAN`, `AC`, `DC`. `NOISE` and `TF` are reserved. |

Per-type required fields:

| `type` | Required fields |
|---|---|
| `OP`   | — |
| `TRAN` | `t_end`, `t_step`. Optional: `t_start` (default 0), `uic` (default `false`). |
| `AC`   | `sweep` (`LIN`/`DEC`/`OCT`), `n_points`, `f_start`, `f_end`. |
| `DC`   | `source` (block id), `start`, `stop`, `step`. |

All numeric fields accept expressions and param references per §5.1.

### 13.2 Sweeps

Any analysis may carry a `sweeps` list. Each sweep is one of:

| Form | Fields |
|---|---|
| Parameter sweep | `{ "param": "<name>", "values": [num, ...] }` |
| Linear range    | `{ "param": "<name>", "lin": { "start": ..., "stop": ..., "n": ... } }` |
| Decade range    | `{ "param": "<name>", "dec": { "start": ..., "stop": ..., "n_per_decade": ... } }` |

Multiple sweeps in one analysis produce a Cartesian product. Sweep parameters must exist in `model.params`.

### 13.3 Solver options

```json
"solver": {
  "abstol":  1e-12,
  "reltol":  1e-3,
  "vntol":   1e-6,
  "method":  "trap",
  "method_options": { ... backend-specific ... }
}
```

`method` is one of `trap`, `gear`, `bdf`, `radau`, `rk45`, `rk23`. The compiler maps it to the solver backend (`ngspice`, `Xyce`, `scipy`) — backends that lack a method emit a clear error at run time.

`method_options` is a free-form bag passed verbatim to the backend; round-trip-stable.

### 13.4 Initial conditions

`initial_conditions[]` accepts two shapes:

| `kind` | Fields | Resolves to |
|---|---|---|
| `node`  | `name`, `value` | Initial value on a named net (§9). |
| `block` | `block`, `var`, `value` | Per-block state IC (same key as block-level `ic`). |

When a state has both a block-level `ic` entry and a model-level `initial_conditions` entry, the model-level entry wins; the loader emits a warning.

### 13.5 Output selection

`output.save_all_nodes` (default `true`): when true, every named net's across-variable is saved. When false, only nets listed in `output.save_nodes` are saved.

`output.save_currents` (default `[]`): list of block ids whose through-variable is saved.

`output.save_block_states` (default `[]`): list of block ids whose internal states are saved.

### 13.6 Empty simulation block

A model with `simulation = {}` is **not directly runnable** — it is a library model or a subsystem definition. The IR-1 build still succeeds; only the analysis launcher rejects it.

---

## 14. Fidelity tiers

The same physical concept exists at three fidelity tiers. The block catalogue declares which tiers exist for a given type; the user picks one via the `fidelity` field.

| Tier | Code | Equations | Solver cost | Typical use |
|---|---|---|---|---|
| Tier-1 | `ideal`      | Linear or simplest smooth model. No saturation, no junction physics, no temperature coefficients. | Lowest. Guaranteed convergence. | First-pass topology exploration; control-loop tuning. |
| Tier-2 | `behavioral` | Physics-based smooth model with named characteristic parameters (e.g. Vth, Cox, B-H curve). | Moderate. Smooth-by-design. | Realistic device behaviour without SPICE-level parameter extraction. |
| Tier-3 | `spice`      | Full SPICE-parameterised model (`.MODEL` card + level/version). | Highest. May require event detection. | Datasheet-level fidelity; production verification. |

| Value | Meaning |
|---|---|
| `n_a` | The block has no fidelity gradient (e.g. signal-flow blocks, hierarchy blocks, routing blocks). Stored literally so loaders never need to special-case missing tiers. |

### 14.1 Fidelity-swap contract

The frontend exposes a "Change fidelity" action on every block whose catalogue declares ≥ 2 tiers. The swap:

1. Replaces `fidelity` in place.
2. Validates the new tier's port shape matches the old tier's port shape — same port ids, same kinds, same directions.
3. If the new tier has parameters the old one did not, they are seeded with defaults from the catalogue.
4. If the old tier had parameters the new one does not, they are dropped (and the loss is reversible until the next save).

Swapping fidelity **never** edits wires, neighbour blocks, or hierarchy.

### 14.2 Smooth-models invariant

Per AGENTS.md invariant §3, equation templates must be smooth/continuous within each fidelity tier. The `ideal` tier is always smooth. The `behavioral` tier must be smooth within each operating region (event-detected switches are permitted at the IR-1 → IR-2 boundary, not in the equations themselves). The `spice` tier inherits whatever the imported `.MODEL` card declares — solver-side event handling deals with non-smooth pieces.

---

## 15. Block type catalogue

The block-metadata schema (`packages/schemas/definitions/blocks/block-metadata.schema.json`) is the authoritative catalogue. This section enumerates v2 entries by paradigm.

### 15.1 Signal-flow blocks

All signal-flow blocks have `paradigm = signal-flow`, `domain = signal` (unless noted), `fidelity = n_a`.

#### Sources

| Type | Ports | Key params |
|---|---|---|
| `signal-flow.source.constant`             | `out` | `value` |
| `signal-flow.source.step`                 | `out` | `before`, `after`, `t_step` |
| `signal-flow.source.ramp`                 | `out` | `slope`, `t_start`, `x0` |
| `signal-flow.source.sine`                 | `out` | `amplitude`, `frequency`, `phase`, `bias`, `sample_time` |
| `signal-flow.source.pulse`                | `out` | `amplitude`, `period`, `pulse_width`, `phase_delay` |
| `signal-flow.source.chirp`                | `out` | `f_start`, `f_end`, `t_end`, `phase` |
| `signal-flow.source.random_normal`        | `out` | `mean`, `variance`, `seed`, `sample_time` |
| `signal-flow.source.random_uniform`       | `out` | `lo`, `hi`, `seed`, `sample_time` |
| `signal-flow.source.band_limited_noise`   | `out` | `cov`, `sample_time`, `seed` |
| `signal-flow.source.clock`                | `out` | `display_decimation` |
| `signal-flow.source.digital_clock`        | `out` | `sample_time` |
| `signal-flow.source.from_workspace`       | `out` | `variable_name`, `sample_time`, `interpolate` |
| `signal-flow.source.from_file`            | `out` | `path`, `column`, `sample_time` |
| `signal-flow.source.repeating_sequence`   | `out` | `t`, `y` |

#### Math

| Type | Ports | Key params |
|---|---|---|
| `signal-flow.math.gain`         | `in`, `out` | `k`, `mode` (`element`/`matrix-pre`/`matrix-post`) |
| `signal-flow.math.sum`          | `in0..inN`, `out` | `signs` (e.g. `"+-+"`), `icon_shape` |
| `signal-flow.math.product`      | `in0..inN`, `out` | `signs` (e.g. `"**/"`) |
| `signal-flow.math.divide`       | `in0`, `in1`, `out` | — |
| `signal-flow.math.subtract`     | `in0`, `in1`, `out` | — |
| `signal-flow.math.abs`          | `in`, `out` | — |
| `signal-flow.math.sign`         | `in`, `out` | — |
| `signal-flow.math.unary_minus`  | `in`, `out` | — |
| `signal-flow.math.bias`         | `in`, `out` | `bias` |
| `signal-flow.math.dot_product`  | `in0`, `in1`, `out` | — |
| `signal-flow.math.math_function`| `in`, (`in2`), `out` | `operator` (`exp`, `log`, `log10`, `pow`, `sqrt`, ...) |
| `signal-flow.math.trig`         | `in`, (`in2`), `out` | `operator` (`sin`, `cos`, ..., `atan2`) |
| `signal-flow.math.rounding`     | `in`, `out` | `operator` (`floor`, `ceil`, `round`, `fix`) |
| `signal-flow.math.minmax`       | `in0..inN`, `out` | `function` (`min`/`max`) |
| `signal-flow.math.polynomial`   | `in`, `out` | `coef` |
| `signal-flow.math.reshape`      | `in`, `out` | `output_dims` |

#### Continuous

| Type | Ports | Key params |
|---|---|---|
| `signal-flow.continuous.integrator`         | `in`, `out` | `ic`, `lo`, `hi`, `external_reset` |
| `signal-flow.continuous.integrator_2nd`     | `in`, `out`, `out_x` | `ic`, `ic_dx` |
| `signal-flow.continuous.derivative`         | `in`, `out` | — |
| `signal-flow.continuous.transfer_function`  | `in`, `out` | `num`, `den` |
| `signal-flow.continuous.state_space`        | `in`, `out` | `A`, `B`, `C`, `D`, `ic` |
| `signal-flow.continuous.zero_pole`          | `in`, `out` | `zeros`, `poles`, `gain` |
| `signal-flow.continuous.transport_delay`    | `in`, `out` | `delay`, `initial_output` |
| `signal-flow.continuous.pid`                | `in`, `out` | `kp`, `ki`, `kd`, `n`, `form` (`parallel`/`ideal`), `anti_windup` |
| `signal-flow.continuous.pid_2dof`           | `r`, `y`, `out` | `kp`, `ki`, `kd`, `b`, `c`, `n` |

#### Discrete

| Type | Ports | Key params |
|---|---|---|
| `signal-flow.discrete.unit_delay`           | `in`, `out` | `ic`, `sample_time` |
| `signal-flow.discrete.delay`                | `in`, `out` | `length`, `ic`, `sample_time` |
| `signal-flow.discrete.zoh`                  | `in`, `out` | `sample_time` |
| `signal-flow.discrete.fir`                  | `in`, `out` | `coefficients`, `sample_time` |
| `signal-flow.discrete.iir`                  | `in`, `out` | `num`, `den`, `sample_time` |
| `signal-flow.discrete.integrator`           | `in`, `out` | `method` (`forward`/`backward`/`trapezoidal`), `ic`, `sample_time` |
| `signal-flow.discrete.transfer_function`    | `in`, `out` | `num`, `den`, `sample_time` |
| `signal-flow.discrete.state_space`          | `in`, `out` | `A`, `B`, `C`, `D`, `ic`, `sample_time` |
| `signal-flow.discrete.zero_pole`            | `in`, `out` | `zeros`, `poles`, `gain`, `sample_time` |
| `signal-flow.discrete.pid`                  | `in`, `out` | `kp`, `ki`, `kd`, `n`, `integrator_method`, `sample_time` |
| `signal-flow.discrete.difference`           | `in`, `out` | `sample_time` |

#### Discontinuity

| Type | Ports | Key params |
|---|---|---|
| `signal-flow.discontinuity.saturation`      | `in`, `out` | `lo`, `hi` |
| `signal-flow.discontinuity.dead_zone`       | `in`, `out` | `lo`, `hi` |
| `signal-flow.discontinuity.rate_limiter`    | `in`, `out` | `rising`, `falling` |
| `signal-flow.discontinuity.relay`           | `in`, `out` | `on_switch`, `off_switch`, `on_out`, `off_out` |
| `signal-flow.discontinuity.quantizer`       | `in`, `out` | `step` |
| `signal-flow.discontinuity.backlash`        | `in`, `out` | `width`, `initial_output` |
| `signal-flow.discontinuity.hit_crossing`    | `in`, `out` | `offset`, `direction` |
| `signal-flow.discontinuity.pwm`             | `in`, `out` | `frequency` |

#### Logic and comparison

| Type | Ports | Key params |
|---|---|---|
| `signal-flow.logic.logical_op`              | `in0..inN`, `out` | `operator` (`and`/`or`/`not`/`xor`/`nand`/`nor`) |
| `signal-flow.logic.relational_op`           | `in0`, `in1`, `out` | `operator` (`==`, `!=`, `<`, `<=`, `>`, `>=`) |
| `signal-flow.logic.compare_to_constant`     | `in`, `out` | `operator`, `value` |
| `signal-flow.logic.compare_to_zero`         | `in`, `out` | `operator` |
| `signal-flow.logic.bitwise_op`              | `in0..inN`, `out` | `operator` |
| `signal-flow.logic.bit_set`                 | `in`, `out` | `bit_index` |
| `signal-flow.logic.bit_clear`               | `in`, `out` | `bit_index` |
| `signal-flow.logic.interval_test`           | `in`, `out` | `lo`, `hi`, `closed_left`, `closed_right` |
| `signal-flow.logic.detect_change`           | `in`, `out` | — |
| `signal-flow.logic.detect_rise_positive`    | `in`, `out` | — |
| `signal-flow.logic.detect_fall_negative`    | `in`, `out` | — |

#### Lookup

| Type | Ports | Key params |
|---|---|---|
| `signal-flow.lookup.table_1d`               | `in`, `out` | `x`, `y`, `interpolation` (`linear`/`cubic`/`nearest`) |
| `signal-flow.lookup.table_2d`               | `in0`, `in1`, `out` | `x`, `y`, `z`, `interpolation` |
| `signal-flow.lookup.table_nd`               | `in0..inN`, `out` | `axes`, `values`, `interpolation` |
| `signal-flow.lookup.prelookup`              | `in`, `out` | `breakpoints` |

#### Sinks

| Type | Ports | Key params |
|---|---|---|
| `signal-flow.sink.scope`                    | `in0..inN` | — |
| `signal-flow.sink.display`                  | `in` | `decimals` |
| `signal-flow.sink.to_workspace`             | `in` | `variable_name`, `sample_time`, `max_data_points` |
| `signal-flow.sink.to_file`                  | `in` | `path`, `sample_time` |
| `signal-flow.sink.xy_graph`                 | `in0`, `in1` | `x_lim`, `y_lim` |
| `signal-flow.sink.terminator`               | `in` | — |
| `signal-flow.sink.stop_simulation`          | `in` | — |

#### Signal attributes

These blocks constrain or annotate the signal on a wire without changing its value. They participate in dimension inference (§7.3) and are how the user pins down a wire's shape.

| Type | Ports | Key params |
|---|---|---|
| `signal-flow.attributes.ic`                  | `in`, `out` | `value` (the initial value the wire takes at t=0; passthrough otherwise) |
| `signal-flow.attributes.signal_specification`| `in`, `out` | `dim` (required shape, e.g. `[3]` or `[2,3]`), `complexity` (`real`/`complex`) |
| `signal-flow.attributes.unit_conversion`     | `in`, `out` | `from_unit`, `to_unit` (free-form unit strings; numeric scale applied) |
| `signal-flow.attributes.probe`               | `in`, `width_out`, `dim_out`, `complexity_out` | — (read-only attribute readout; outputs are scalars describing the input wire) |

`signal-flow.attributes.data_type_conversion` and `signal-flow.attributes.rate_transition` are **deferred to v3** — they only become meaningful once non-`double` data types and multi-rate scheduling ship (§18).

### 15.2 Physical-electrical blocks

All have `paradigm = physical-network`, `domain = physical-electrical`.

#### Passive (tiers: `ideal`, `behavioral`, `spice`)

| Type | Ports | Key params (ideal) |
|---|---|---|
| `physical-electrical.passive.resistor`        | `p`, `n` | `R` |
| `physical-electrical.passive.capacitor`       | `p`, `n` | `C` |
| `physical-electrical.passive.inductor`        | `p`, `n` | `L` |
| `physical-electrical.passive.mutual_inductor` | `p1`, `n1`, `p2`, `n2` | `L1`, `L2`, `k` |
| `physical-electrical.passive.transformer`     | `p1`, `n1`, `p2`, `n2` | `n` (turns ratio) |
| `physical-electrical.passive.memristor`       | `p`, `n` | (fidelity-dependent) |
| `physical-electrical.passive.gyrator`         | `p1`, `n1`, `p2`, `n2` | `g` |

`behavioral` and `spice` tiers add named-physics or `.MODEL` parameters per the catalogue.

#### Sources

| Type | Ports | Key params |
|---|---|---|
| `physical-electrical.source.voltage_dc`      | `p`, `n` | `V` |
| `physical-electrical.source.current_dc`      | `p`, `n` | `I` |
| `physical-electrical.source.voltage_ac`      | `p`, `n` | `amplitude`, `frequency`, `phase`, `bias` |
| `physical-electrical.source.current_ac`      | `p`, `n` | `amplitude`, `frequency`, `phase`, `bias` |
| `physical-electrical.source.voltage_pulse`   | `p`, `n` | `v_lo`, `v_hi`, `t_delay`, `t_rise`, `t_fall`, `t_on`, `period` |
| `physical-electrical.source.voltage_pwl`     | `p`, `n` | `t`, `v` |
| `physical-electrical.source.vcvs`            | `p_out`, `n_out`, `p_ctl`, `n_ctl` | `gain` |
| `physical-electrical.source.vccs`            | `p_out`, `n_out`, `p_ctl`, `n_ctl` | `gm` |
| `physical-electrical.source.ccvs`            | `p_out`, `n_out`, `p_ctl`, `n_ctl` | `transresistance` |
| `physical-electrical.source.cccs`            | `p_out`, `n_out`, `p_ctl`, `n_ctl` | `gain` |
| `physical-electrical.source.controlled_voltage` | `p`, `n`, `ctl` | — (driven by `physical-signal` input) |
| `physical-electrical.source.controlled_current` | `p`, `n`, `ctl` | — |

#### Semiconductors (tiers: `ideal`, `behavioral`, `spice`)

| Type | Ports |
|---|---|
| `physical-electrical.semiconductor.diode`        | `p`, `n` |
| `physical-electrical.semiconductor.led`          | `p`, `n` |
| `physical-electrical.semiconductor.photodiode`   | `p`, `n`, `light` |
| `physical-electrical.semiconductor.zener`        | `p`, `n` |
| `physical-electrical.semiconductor.bjt_npn`      | `B`, `C`, `E` |
| `physical-electrical.semiconductor.bjt_pnp`      | `B`, `C`, `E` |
| `physical-electrical.semiconductor.mosfet_n`     | `G`, `D`, `S`, `B` (B optional in `ideal`) |
| `physical-electrical.semiconductor.mosfet_p`     | `G`, `D`, `S`, `B` |
| `physical-electrical.semiconductor.igbt_n`       | `G`, `C`, `E` |
| `physical-electrical.semiconductor.thyristor`    | `G`, `A`, `K` |

#### Switches and op-amps (tiers: `ideal`, `behavioral`)

| Type | Ports | Key params |
|---|---|---|
| `physical-electrical.switch.voltage_controlled` | `p`, `n`, `p_ctl`, `n_ctl` | `v_on`, `v_off`, `r_on`, `r_off` |
| `physical-electrical.switch.current_controlled` | `p`, `n`, `p_ctl`, `n_ctl` | `i_on`, `i_off`, `r_on`, `r_off` |
| `physical-electrical.switch.generic`            | `p`, `n`, `ctl` | `r_on`, `r_off`, `threshold` |
| `physical-electrical.opamp.ideal`               | `vp`, `vn`, `out` | — |
| `physical-electrical.opamp.finite_gain`         | `vp`, `vn`, `out` | `Av`, `v_sat` |
| `physical-electrical.opamp.band_limited`        | `vp`, `vn`, `out` | `gbp`, `sr`, `rin`, `rout` |
| `physical-electrical.opamp.comparator`          | `vp`, `vn`, `out` | `v_hys` |

#### Sensors

| Type | Ports |
|---|---|
| `physical-electrical.sensor.voltage`  | `p`, `n`, `out` (`physical-signal`) |
| `physical-electrical.sensor.current`  | `p`, `n`, `out` (`physical-signal`) |

#### References

| Type | Ports |
|---|---|
| `physical-electrical.reference.ground` | `p` |

#### Transmission lines

| Type | Ports | Key params |
|---|---|---|
| `physical-electrical.tline.lossless` | `p1`, `n1`, `p2`, `n2` | `Z0`, `TD` |
| `physical-electrical.tline.lossy`    | `p1`, `n1`, `p2`, `n2` | `Z0`, `TD`, `R`, `L`, `G`, `C` |

### 15.3 Physical-translational blocks (tiers: `ideal`, `behavioral`)

Domain: `physical-translational`. Through = force (N); across = velocity (m/s).

| Type | Ports | Key params |
|---|---|---|
| `physical-translational.element.mass`                 | `p`, `n` | `mass` |
| `physical-translational.element.spring`               | `p`, `n` | `stiffness` |
| `physical-translational.element.damper`               | `p`, `n` | `damping` |
| `physical-translational.element.friction`             | `p`, `n` | `coulomb`, `viscous` |
| `physical-translational.element.hard_stop`            | `p`, `n` | `lo`, `hi`, `stiffness`, `damping` |
| `physical-translational.reference.world`              | `p` | — |
| `physical-translational.source.force`                 | `p`, `n`, `ctl` | — |
| `physical-translational.source.velocity`              | `p`, `n`, `ctl` | — |
| `physical-translational.sensor.force`                 | `p`, `n`, `out` | — |
| `physical-translational.sensor.velocity`              | `p`, `n`, `out` | — |
| `physical-translational.sensor.position`              | `p`, `n`, `out` | — |

### 15.4 Physical-rotational blocks (tiers: `ideal`, `behavioral`)

Domain: `physical-rotational`. Through = torque (N·m); across = angular velocity (rad/s).

| Type | Ports | Key params |
|---|---|---|
| `physical-rotational.element.inertia`                 | `p`, `n` | `inertia` |
| `physical-rotational.element.spring`                  | `p`, `n` | `stiffness` |
| `physical-rotational.element.damper`                  | `p`, `n` | `damping` |
| `physical-rotational.element.friction`                | `p`, `n` | `coulomb`, `viscous` |
| `physical-rotational.element.hard_stop`               | `p`, `n` | `lo`, `hi`, `stiffness`, `damping` |
| `physical-rotational.reference.world`                 | `p` | — |
| `physical-rotational.source.torque`                   | `p`, `n`, `ctl` | — |
| `physical-rotational.source.angular_velocity`         | `p`, `n`, `ctl` | — |
| `physical-rotational.sensor.torque`                   | `p`, `n`, `out` | — |
| `physical-rotational.sensor.angular_velocity`         | `p`, `n`, `out` | — |
| `physical-rotational.sensor.angle`                    | `p`, `n`, `out` | — |

### 15.5 Physical-thermal blocks (tiers: `ideal`, `behavioral`)

Domain: `physical-thermal`. Through = heat flow (W); across = temperature (K).

| Type | Ports | Key params |
|---|---|---|
| `physical-thermal.element.mass`                       | `p` | `mass`, `specific_heat` |
| `physical-thermal.element.resistance`                 | `p`, `n` | `R_th` |
| `physical-thermal.element.conduction`                 | `p`, `n` | `area`, `thickness`, `k` |
| `physical-thermal.element.convection`                 | `p`, `n` | `area`, `h` |
| `physical-thermal.element.radiation`                  | `p`, `n` | `area`, `emissivity` |
| `physical-thermal.reference.absolute`                 | `p` | — |
| `physical-thermal.source.heat_flow`                   | `p`, `n` | `Q` |
| `physical-thermal.source.temperature`                 | `p`, `n` | `T` |
| `physical-thermal.source.controlled_heat_flow`        | `p`, `n`, `ctl` | — |
| `physical-thermal.source.controlled_temperature`      | `p`, `n`, `ctl` | — |
| `physical-thermal.sensor.heat_flow`                   | `p`, `n`, `out` | — |
| `physical-thermal.sensor.temperature`                 | `p`, `n`, `out` | — |

### 15.6 Converter blocks

`paradigm = converter`. Each block has one input-side port-kind and one output-side port-kind.

| Type | In-kind | Out-kind | Key params |
|---|---|---|---|
| `converter.signal_to_physical_signal`             | `signal` | `physical-signal` | `unit` |
| `converter.physical_signal_to_signal`             | `physical-signal` | `signal` | `unit` |
| `converter.rotational_to_translational`           | `physical-rotational` | `physical-translational` | `radius` |
| `converter.translational_to_rotational`           | `physical-translational` | `physical-rotational` | `radius` |
| `converter.electrical_to_rotational`              | `physical-electrical` | `physical-rotational` | `kt`, `ke` |
| `converter.rotational_to_electrical`              | `physical-rotational` | `physical-electrical` | `kt`, `ke` |
| `converter.electrical_to_translational`           | `physical-electrical` | `physical-translational` | `bl` |
| `converter.translational_to_electrical`           | `physical-translational` | `physical-electrical` | `bl` |
| `converter.electrical_to_thermal`                 | `physical-electrical` | `physical-thermal` | — (Joule heating) |

### 15.7 Routing blocks

`paradigm = routing`, `fidelity = n_a`. Domain is the kind they route (typically `signal`).

| Type | Ports | Key params |
|---|---|---|
| `routing.goto`                  | `in` | `tag`, `visibility` (`local`/`scoped`/`global`) |
| `routing.from`                  | `out` | `tag` |
| `routing.mux`                   | `in0..inN`, `out` | — |
| `routing.demux`                 | `in`, `out0..outN` | `outputs` |
| `routing.bus_creator`           | `in0..inN`, `out` | `elements` (names) |
| `routing.bus_selector`          | `in`, `out0..outN` | `elements` |
| `routing.bus_assignment`        | `in_bus`, `in0..inN`, `out` | `assigned` |
| `routing.selector`              | `in`, `out` | `indices` |
| `routing.merge`                 | `in0..inN`, `out` | `initial_output` |
| `routing.manual_switch`         | `in0`, `in1`, `out` | `current` (0/1) |
| `routing.multiport_switch`      | `ctl`, `in0..inN`, `out` | — |
| `routing.switch`                | `ctl`, `in0`, `in1`, `out` | `criteria`, `threshold` |
| `routing.data_store_memory`     | — | `name`, `initial_value` |
| `routing.data_store_read`       | `out` | `name` |
| `routing.data_store_write`      | `in` | `name` |

### 15.8 Hierarchy blocks

`paradigm = hierarchy`, `fidelity = n_a`.

| Type | Notes |
|---|---|
| `hierarchy.subsystem.atomic`     | Atomic execution unit. |
| `hierarchy.subsystem.virtual`    | Pure grouping; flattened at IR-1. |
| `hierarchy.subsystem.enabled`    | Carries an `enable` port. |
| `hierarchy.subsystem.triggered`  | Carries a `trigger` port. |
| `hierarchy.subsystem.iterator`   | Iterates per parent step. |
| `hierarchy.inport`               | Subsystem boundary input. Bound to a `subsystem.ports` entry. |
| `hierarchy.outport`              | Subsystem boundary output. |

---

## 16. Compilation pipeline

```
.gsim_sch file
    │
    ▼
gsim_sch_loader.load()            schema_version + JSON Schema + structural rules
    │                              + param expression evaluation + alias resolution
    ▼
gsim_sch_flatten()                inline subsystems → flat block/wire list
    │                              + per-block id namespace check
    ▼
goto_from_resolve()               replace Goto/From pairs with direct wires
    │                              + tag visibility check
    ▼
ir1_builder.build()               ModelDocument → IR1Graph
    │                              + per-paradigm partitioning
    ▼
   ┌──────────────────────────────┴───────────────────────────────┐
   ▼                                                              ▼
spice_netlist_writer            signal_flow_lowerer
(physical-electrical only)       (signal-flow + converters)
   │                                                              │
   ▼                                                              ▼
ngspice / Xyce                                                  scipy ODE
   │                                                              │
   └──────────────────────────┬───────────────────────────────────┘
                              ▼
                      result_aggregator
                              │
                              ▼
                         IPC result delivery
```

IR-1 (`packages/simulator/src/simulator/ir/ir1.py`) gains the following fields:

```python
@dataclass
class IR1Block:
    instance_id: str
    block_type:  str
    paradigm:    str      # signal-flow | physical-network | converter | routing | hierarchy
    domain:      str      # signal | physical-electrical | ...
    fidelity:    str      # ideal | behavioral | spice | n_a
    params:      dict[str, Any]
    ic:          dict[str, Any]

@dataclass
class IR1Connection:
    src:  tuple[str, str]
    dst:  tuple[str, str]
    kind: str             # the port-kind carried
    net:  str | None      # named net, if any

@dataclass
class IR1Graph:
    blocks:      list[IR1Block]
    connections: list[IR1Connection]
    params:      dict[str, float]            # resolved scalar values
    nets:        list[IR1Net]
    simulation:  IR1SimulationDirective
```

Subsystems do not survive flattening; the flat IR-1 carries only leaf blocks.

---

## 17. Validation rules

The loader rejects a file unless **all** of the following hold.

### 17.1 Structural

1. `schema_version == 2`.
2. The document validates against `gsim_sch.schema.json` (JSON Schema 2020-12, strict; `additionalProperties: false`).
3. Every `block.id` and `wire.id` is unique across the entire file (parent + all nested subsystems).
4. Every `wire.from.block` and `wire.to.block` resolves to an existing block id.
5. Every `wire.from.port` and `wire.to.port` resolves to a port id declared by the catalogue entry for the referenced block's `(type, fidelity)`.
6. Every `subsystem.ports[*].boundary_block` resolves to a `hierarchy.inport` / `hierarchy.outport` block inside the same subsystem with matching direction and kind.
7. `model.role`, if present, is `"schematic"` or `"library"` (§4.1), and appears only on the top-level model.

### 17.2 Direction and kind

1. For signal-flow wires: `from` is the source's output port, `to` is the sink's input port.
2. For acausal wires: both endpoints' port kinds match `wire.kind`.
3. No wire crosses between paradigms without a `converter.*` block.
4. Fan-in on signal-flow wires is forbidden; aggregation requires `routing.merge`, `routing.mux`, or `routing.bus_creator`.

### 17.3 Parameter resolution

1. `params[*].name` is unique within the model.
2. The `params` dependency graph is a DAG.
3. Every identifier in a param expression resolves either to another param (in the current scope, walking up subsystem aliases) or to a built-in (`pi`, `e`).
4. Block param values' identifier references resolve in the same scope.
5. No identifier resolves to `__`-prefixed names (defensive).

### 17.4 Canonical key ordering (writer)

A `.gsim_sch` writer **must** emit keys in this order at each level:

- Top: `schema_version`, `model`.
- Model: `id`, `name`, `role`, `grid`, `params`, `blocks`, `wires`, `lines`, `nets`, `simulation`, `metadata`. `role` is emitted only when present in the source document — a writer never materialises the `"schematic"` default, so byte-exact roundtrip holds for pre-`role` files.
- Block: `id`, `type`, `paradigm`, `domain`, `fidelity`, `position`, `rotation`, `mirror`, `params`, `ic`, `label`, `subsystem`.
- Wire: `id`, `from`, `to`, `waypoints`, `pinned`, `net`, `kind`, `label`.
- Param entry: `name`, `value`, `unit`, `doc`.
- Net: `name`, `kind`, `scope`, `is_reference`.

Within `params` (block) and `ic` objects, keys are emitted in lexicographic order. Wire `waypoints` arrays retain insertion order. Block `subsystem` (when present) recursively follows the Model order.

A roundtrip CI gate (FE-RT-01 / BE-RT-01) reads a file, writes it back, and asserts byte-exact equality.

### 17.5 Simulation directives

1. `simulation.analyses[*].id` is unique within the list.
2. `simulation.default_analysis`, if present, references an analysis id.
3. Per-type required fields (§13.1) are present and well-typed.
4. Sweep params exist in `model.params`.
5. ICs reference existing nets or existing block states.

---

## 18. v2 limitations

| Limitation | Detail |
|---|---|
| No `reserved.*` port kinds | Magnetic, hydraulic, and fluid kinds are reserved in the schema but no blocks ship in v2. |
| No model references | Subsystems live inline only. An external reference mechanism (`hierarchy.model_reference`) is planned for v3. |
| Single-rate scheduling for signal-flow | All signal-flow blocks share one sample-time domain in v2. Multi-rate models require `signal-flow.attributes.rate_transition` (not in v2) and the multi-rate scheduler (v3). |
| No fixed-point types | Signal-flow signals are `double` only. Fixed-point and integer types land in v3, alongside `signal-flow.attributes.data_type_conversion`. |
| No iterator or function-call subsystems | `hierarchy.subsystem.iterator` and the function-call subsystem family are out of v2 scope; the loader rejects them. |
| No `NOISE` / `TF` analyses | The analysis enum includes them but the v2 compiler rejects them with a clear "not implemented" error. |
| No matrix operations beyond what's in §15.1 Math | `matrix_multiply`, `transpose`, `identity`, `submatrix`, and similar linear-algebra blocks are out of v2. The dim-propagation pass supports matrix-shaped wires; the operations themselves ship in v3. |
| No user-defined function blocks | inline-script-style `fcn` / `script_function` / `c_caller` / `s_function` blocks are out of v2. |
| No FMU import/export | Planned for v3. |

---

## 19. Validation errors quick reference

| Error message fragment | Cause | Fix |
|---|---|---|
| `Unsupported gsim_sch schema_version` | `schema_version` is not `2` | Set `"schema_version": 2`. |
| `Float coordinate at <path>` | A coordinate or waypoint contains a float | Use `[int, int]`. |
| `Invalid model role "<role>"` | `model.role` is present but is not `"schematic"` or `"library"` | Use one of the two values, or drop the key to get the `"schematic"` default (§4.1). |
| `Duplicate id "<id>" across subsystems` | Block/wire id reused | Make ids globally unique. |
| `Unknown port "<port>" on block "<id>"` | Wire references a port not declared by the block's catalogue | Check the catalogue entry for the `(type, fidelity)` pair. |
| `Cross-paradigm wire from <kind-a> to <kind-b>` | Direct signal ↔ physical wire | Insert the appropriate `converter.*` block. |
| `Fan-in on signal port "<id>"` | More than one wire drives a signal-flow input | Insert `routing.merge` / `routing.mux`. |
| `Param cycle: <a> → <b> → ... → <a>` | Expression dependency graph has a cycle | Break the cycle by inlining a literal. |
| `Unresolved From tag "<tag>"` | A `routing.from` has no matching `routing.goto` in scope | Add a Goto, or widen its visibility. |
| `Ambiguous From tag "<tag>"` | Multiple Gotos visible for the same tag | Tighten visibility to a single Goto. |
| `Boundary block "<id>" not found` | `subsystem.ports[*].boundary_block` does not point to an inport/outport | Add or rename the boundary block. |
| `Reserved port kind "<kind>" not yet supported` | A block uses `reserved.physical-magnetic`/`hydraulic`/`fluid` | Use a supported kind; the v2 catalogue does not ship blocks of these kinds. |
| `Analysis type "<t>" not implemented in v2` | `simulation.analyses[*].type` is `NOISE` or `TF` | Remove the analysis or wait for v3. |
| `Dimension mismatch on wire "<id>": expected <dim>, got <dim>` | Two signal-flow ports of incompatible dim wired together | Insert `routing.mux`/`demux` or fix the source block's output shape. |
| `Dimension unresolved on wire "<id>"` | Inference reached fixed point without resolving | Add a `signal-flow.attributes.signal_specification` block to pin the dim, or replace an `inherit` source. |
| `Dimension loop: <a> → <b> → ... → <a>` | Cycle of `inherit`-only blocks | Break the cycle with a Signal Specification. |
| `Subsystem variant "<t>" not implemented in v2` | A block uses `hierarchy.subsystem.iterator` or a function-call subsystem | Use atomic/virtual/enabled/triggered; iterator + function-call are v3. |

---

*End of `.gsim_sch` v2 specification.*
