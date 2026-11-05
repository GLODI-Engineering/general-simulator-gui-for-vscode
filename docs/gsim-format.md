# `.gsim` File Format Reference

The `.gsim` file is the canonical serialisation format for general-simulator
models. It is a UTF-8 JSON document validated against
`packages/schemas/definitions/model/gsim.schema.json` (JSON Schema 2020-12).

---

## Table of Contents

1. [Top-level structure](#1-top-level-structure)
2. [Model object](#2-model-object)
3. [Block object](#3-block-object)
4. [Wire object](#4-wire-object)
5. [Block type catalogue](#5-block-type-catalogue)
6. [Net assignment algorithm](#6-net-assignment-algorithm)
7. [Compilation pipeline](#7-compilation-pipeline)
8. [Building a document in Python](#8-building-a-document-in-python)
9. [v1 limitations](#9-v1-limitations)
10. [Validation errors quick reference](#10-validation-errors-quick-reference)

---

## 1. Top-level structure

```json
{
  "schema_version": 1,
  "model": { ... }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | `integer` | yes | Must be `1`. The loader rejects any other value. |
| `model` | object | yes | See §2. |

The loader (`packages/simulator/src/simulator/compiler/gsim_loader.py`) accepts
a file path, a JSON string, or an already-parsed dict:

```python
from simulator.compiler.gsim_loader import load

doc = load("mymodel.gsim")          # from file
doc = load('{"schema_version":1,…}') # from string
doc = load(my_dict)                  # from dict
```

---

## 2. Model object

```json
{
  "id": "rc-low-pass",
  "name": "RC Low-Pass Filter",
  "grid": 10,
  "blocks": [ ... ],
  "wires":  [ ... ],
  "metadata": {}
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (non-empty) | yes | Stable identifier; used as the simulation ID seed. |
| `name` | string (non-empty) | yes | Human-readable display name. |
| `grid` | integer ≥ 1 | yes | Canvas grid pitch in pixels. Does not affect simulation. |
| `blocks` | Block[] | yes | May be empty. |
| `wires` | Wire[] | yes | May be empty. |
| `metadata` | object | yes | Free-form key/value bag. `{}` when unused. |

---

## 3. Block object

```json
{
  "id": "r1",
  "type": "passive.resistor",
  "position": [100, 200],
  "rotation": 0,
  "mirror": "none",
  "params": { "R": 1000 }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (non-empty) | yes | Unique within the model. Used to reference endpoints in wires. |
| `type` | string | yes | Dot-separated namespace: `<domain>.<kind>` or `<domain>.<kind>.<variant>`. Pattern: `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`. |
| `position` | `[int, int]` | yes | Canvas grid coordinates. **Must be integers — floats are rejected by the loader.** |
| `rotation` | 0 \| 90 \| 180 \| 270 | yes | Degrees clockwise. |
| `mirror` | `"none"` \| `"x"` \| `"y"` | yes | Flip axis, or `"none"`. |
| `params` | object | yes | Type-specific parameter bag. See §5 for per-type params. |

---

## 4. Wire object

```json
{
  "id": "w1",
  "from": { "block": "v1",  "port": "p" },
  "to":   { "block": "r1",  "port": "p" },
  "waypoints": [],
  "pinned": false
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (non-empty) | yes | Unique within the model. |
| `from` | Endpoint | yes | Source block+port. |
| `to` | Endpoint | yes | Destination block+port. |
| `waypoints` | `[int,int][]` | yes | Orthogonal polyline control points. Use `[]` when the wire is straight. |
| `pinned` | boolean | yes | Whether the router locks waypoints. Use `false` by default. |

An **Endpoint** is `{ "block": "<block_id>", "port": "<port_id>" }`.

Wires are undirected at the schema level. The compiler treats `from`/`to`
symmetrically when building nets.

---

## 5. Block type catalogue

Block types follow the pattern `<domain>.<kind>[.<variant>]`.

### 5.1 Passive (circuit domain)

All passive blocks expose ports `p` (positive) and `n` (negative).

| Type | SPICE element | Key params | Notes |
|---|---|---|---|
| `passive.resistor` | `R` | `R` (Ω) | |
| `passive.resistor.behavioral` | `R` | `R` (Ω) | Alias; same renderer. |
| `passive.resistor.semiconductor` | `R` | `R` (Ω) | Alias; same renderer. |
| `passive.capacitor` | `C` | `C` (F), `IC` (V) | `IC` optional; emits `IC=<value>` on netlist line. |
| `passive.capacitor.behavioral` | `C` | `C` (F), `IC` (V) | |
| `passive.capacitor.semiconductor` | `C` | `C` (F), `IC` (V) | |
| `passive.inductor` | `L` | `L` (H), `IC` (A) | Default L = 1 mH when param absent. |
| `passive.inductor.behavioral` | `L` | `L` (H), `IC` (A) | |

### 5.2 Sources (circuit domain)

| Type | SPICE element | Ports | Key params |
|---|---|---|---|
| `source.voltage.dc` | `V … DC <V>` | `p`, `n` | `V` (V) |

### 5.3 Control domain

Control blocks carry scalar signals; they are not wired into SPICE netlists.

| Type | Ports | Key params |
|---|---|---|
| `control.sum` | `in0`…`inN`, `out` | `signs` (e.g. `"+-"`) — one char per input |
| `control.gain` | `in`, `out` | `k` (gain scalar) |
| `control.pid` | `in`, `out` | `kp`, `ki`, `kd`, `anti_windup` (bool) |
| `control.integrator` | `in`, `out` | `lo`, `hi` (output clamp limits) |
| `control.differentiator` | `in`, `out` | — |
| `control.transfer_function` | `in`, `out` | `num` (list), `den` (list) — coefficient arrays |
| `control.saturation` | `in`, `out` | `lo`, `hi` |
| `control.dead_zone` | `in`, `out` | `lo`, `hi` |
| `control.rate_limiter` | `in`, `out` | `rising`, `falling` |
| `control.lookup_table` | `in`, `out` | `x` (list), `y` (list) |

### 5.4 Signal sources

| Type | Ports | Key params |
|---|---|---|
| `signal.step` | `out` | `amplitude`, `t_step` |
| `signal.ramp` | `out` | `slope`, `t_start` |
| `signal.sine` | `out` | `amplitude`, `frequency`, `phase`, `offset` |
| `signal.pulse` | `out` | `amplitude`, `period`, `duty_cycle`, `t_start` |
| `signal.constant` | `out` | `value` |
| `signal.noise` | `out` | `amplitude`, `seed` |
| `signal.chirp` | `out` | `amplitude`, `f_start`, `f_end`, `t_end` |
| `signal.from_file` | `out` | `path` (CSV/NPY), `column` |

### 5.5 Sinks / scopes

| Type | Ports | Key params |
|---|---|---|
| `sinks.scope` | `in` (variadic) | — |
| `sinks.to_workspace` | `in` | `variable_name` |
| `sinks.display` | `in` | — |

### 5.6 Transmission lines (circuit domain)

| Type | Ports | Key params |
|---|---|---|
| `tline.lossless` | `p1`, `n1`, `p2`, `n2` | `Z0` (Ω), `TD` (s) |
| `tline.lossy` | `p1`, `n1`, `p2`, `n2` | `Z0`, `TD`, `R`, `L`, `G`, `C` per-unit |

---

## 6. Net assignment algorithm

The compiler (`spice_netlist_writer.py`) uses **union-find** over all
`(block_id, port_id)` endpoints:

1. Each block port is initialised as its own component.
2. Every wire unions `from` and `to` endpoints.
3. Components are sorted lexicographically by their minimum endpoint.
4. The **ground component** is chosen:
   - If any endpoint has a port name in `{"0", "GND"}` (case-insensitive), the
     first such component becomes ground (net `"0"`).
   - Otherwise, the component connected to the most blocks is chosen.
5. Remaining components are named `net1`, `net2`, … in sorted order.

Net names are compiler-assigned. v1 does not support user-defined labels like
`VCC`.

---

## 7. Compilation pipeline

```
.gsim file
    │
    ▼
gsim_loader.load()          validates schema_version + position types
    │                        + full JSON Schema (if jsonschema installed)
    ▼
ir1_builder.build()         ModelDocument → IR1Graph
    │                        (IR1Block + IR1Connection dataclasses)
    ▼
spice_netlist_writer        IR1Graph + SolverOptions → SPICE netlist string
    │  write_netlist()
    ▼
ngspice / Xyce              external solver invocation
```

**IR1Graph** (`packages/simulator/src/simulator/ir/ir1.py`):

```python
@dataclass
class IR1Block:
    instance_id: str
    block_type:  str
    params:      dict[str, Any]

@dataclass
class IR1Connection:
    src: tuple[str, str]   # (block_id, port_id)
    dst: tuple[str, str]

@dataclass
class IR1Graph:
    blocks:      list[IR1Block]
    connections: list[IR1Connection]
```

---

## 8. Building a document in Python

### 8.1 Raw dict

```python
doc = {
    "schema_version": 1,
    "model": {
        "id": "rc1",
        "name": "RC Low-Pass",
        "grid": 10,
        "metadata": {},
        "blocks": [
            {
                "id": "v1",
                "type": "source.voltage.dc",
                "position": [0, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {"V": 5.0},
            },
            {
                "id": "r1",
                "type": "passive.resistor",
                "position": [100, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {"R": 1000},
            },
            {
                "id": "c1",
                "type": "passive.capacitor",
                "position": [200, 0],
                "rotation": 0,
                "mirror": "none",
                "params": {"C": 1e-6, "IC": 0.0},
            },
        ],
        "wires": [
            {
                "id": "w1",
                "from": {"block": "v1", "port": "p"},
                "to":   {"block": "r1", "port": "p"},
                "waypoints": [],
                "pinned": False,
            },
            {
                "id": "w2",
                "from": {"block": "r1", "port": "n"},
                "to":   {"block": "c1", "port": "p"},
                "waypoints": [],
                "pinned": False,
            },
            {
                "id": "w3",
                "from": {"block": "v1", "port": "n"},
                "to":   {"block": "c1", "port": "n"},
                "waypoints": [],
                "pinned": False,
            },
        ],
    },
}

from simulator.compiler.gsim_loader import load
validated = load(doc)
```

### 8.2 Save and reload

```python
import json, pathlib

path = pathlib.Path("rc1.gsim")
path.write_text(json.dumps(doc, indent=2), encoding="utf-8")

reloaded = load(path)
```

### 8.3 Compile to netlist

```python
from simulator.compiler.ir1_builder import build
from simulator.compiler.spice_netlist_writer import write_netlist
from simulator.solvers.protocol import SolverOptions

ir1 = build(validated)
opts = SolverOptions(
    analysis_type="TRAN",
    t_end=5e-3,
    n_samples=1000,
    uic=True,       # use element IC= values; skip DC OP
)
netlist = write_netlist(ir1, opts)
print(netlist)
```

---

## 9. v1 limitations

| Limitation | Detail |
|---|---|
| No user-defined net labels | `VCC`, `GND` labels are not propagated; ground is detected heuristically. |
| Integer positions only | `position` must be `[int, int]`. Float coordinates are rejected by the loader. |
| `write_netlist` raises on unknown block types | Only the 9 types in `BLOCK_TO_SPICE` are wired. Control/signal/sink blocks cannot be passed to the SPICE netlist writer. |
| `schema_version` pinned to 1 | No migration shim exists; older or newer versions are rejected. |
| Single-sheet only | No hierarchy or subsystems. |
| No bus/vector signals | All wires carry scalar signals. |

---

## 10. Validation errors quick reference

| Error message fragment | Cause | Fix |
|---|---|---|
| `Unsupported gsim schema_version` | `schema_version` is not `1` | Set `"schema_version": 1` |
| `has invalid position … float coordinates are not allowed` | A block `position` contains floats | Use `[int, int]` — e.g. `[100, 200]` not `[100.0, 200.0]` |
| `gsim schema validation failed` | Any JSON Schema constraint violated | Check required fields; `type` must match `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$` |
| `Unknown block type` | A block type is not registered in `BLOCK_TO_SPICE` | Use only circuit-domain types for SPICE netlists; see §5 |
| `Unsupported analysis_type` | `SolverOptions.analysis_type` not in `{TRAN, AC, DC, OP}` | Use one of the four supported strings |
