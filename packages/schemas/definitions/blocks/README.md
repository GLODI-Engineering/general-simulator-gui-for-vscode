# Block metadata schema

Every functional block in `packages/blocks/src/blocks/**/` has exactly one
`metadata.yaml` next to its equation template. That file is the **shared
contract** between the frontend (visual + search + inspector) and the
simulator (causality + state + equation binding). The frontend never invents
fields that should be here; the simulator never reads anything *outside* this
file at catalog-load time.

- **Schema:** [`block-metadata.schema.json`](./block-metadata.schema.json)
- **Cross-references:**
  - Frontend usage: [`docs/specs/frontend-spec.md`](../../../../docs/specs/frontend-spec.md) §9
  - Epic that consumes it: `progress.yaml` FE-23
  - Port-kind subschema: [`../model/port-kind.schema.json`](../model/port-kind.schema.json)

## File anatomy

```yaml
name:        signal.constant            # <category>.<identifier> — must match path
label:       Constant                   # shown in UI
version:     1                          # schema version (only 1 today)
category:    signal                     # signal | control | power | sinks | subsystems | user
description: Outputs a constant value.  # one-line, for tooltip
aliases:     [const, K]                 # fuzzy-search boost
tags:        [source, signal]           # filtering hints

ports:
  inputs: []
  outputs:
    - { id: out, label: "", kind: { domain: signal, dims: scalar }, side: right, offset: 20 }
  # optional:
  # variadic_inputs:
  #   count_from: signs           # param controlling input count
  #   template: { id: in, label: "", kind: ..., side: left, offset: 0 }

params:
  - name: value
    label: Value
    type: number             # number | integer | vector | matrix | string | bool | enum
    default: 1.0
    description: The constant output value.

symbol:
  bbox: [60, 40]             # integer [width, height] in canvas units
  shape: rect                # rect | circle | triangle | custom
  text: "{value}"            # {paramName} interpolation supported
  # path: "M 0 0 ..."        # required when shape == custom

behavior:
  causality:         source              # source | causal | acausal | sink
  domain:            signal              # signal | electrical | thermal | mechanical | event | mixed
  state_count:       0                   # integer ≥ 0, or "dynamic"
  equation_template: signal.constant     # resolved by packages/simulator/

main_param: value          # optional — the Alt+Enter target
```

## Field stability

`name`, port `id`s, and param `name`s are **persisted in every saved model**.
Renaming any of them is a breaking change to every `.gsim` file on disk.
Treat these as a public API:

- Add new ports / params freely (with safe defaults).
- Mark old ones deprecated, but keep them serializable, until a major version.
- Never silently re-purpose an existing identifier.

## Coordinate convention

- Port `side` selects an edge of the bbox in the **unrotated, unmirrored**
  block. The renderer applies rotation and mirror transforms at draw time;
  the metadata stays canonical.
- `offset` is the distance along that side from the top-left corner of the
  bbox: for `side: left|right` it is measured top → bottom; for
  `side: top|bottom`, left → right.
- A block with `bbox: [60, 40]` and a single output on the right side at
  `offset: 20` has its port at the geometric middle of the right edge,
  rendered as a 4 px circle at local coord `(60, 20)`.

## How the simulator uses this file

The frontend stops at `symbol`, `ports`, `params`, search hints, and
`main_param`. The simulator's lowering stage (`packages/simulator/`) reads:

- `behavior.causality` — to validate port directionality during IR-1
  topology construction.
- `behavior.domain` — to dispatch which KCL/KVL/bond-graph constraint set
  applies at the block's nets.
- `behavior.state_count` — to allocate state variables in IR-2.
- `behavior.equation_template` — to look up the Python symbolic template
  that emits IR-2 equations during lowering.

The `params` field is shared: the frontend uses it for editors; the
simulator passes the param dict into the equation template.

## Validation chain

1. Each YAML is round-tripped through the JSON Schema by the catalog
   loader (FE-23) at startup. Schema failures crash the app with the
   offending file path + JSON pointer.
2. Cross-field rules not expressible in pure JSON Schema (e.g.
   `default` must match `type`; `main_param` must exist in `params`) are
   enforced in the loader and tested separately.
3. The generated catalog manifest is checked into Git
   (`apps/frontend/src/library/catalog-manifest.json`); CI fails if it
   drifts from the YAML sources.

## Adding a block

Use the `/new-block` skill — it scaffolds the directory, the YAML, an
equation template, the test stubs, and the frontend registration in one
go. See `docs/agent-rules/skills/new-block/SKILL.md`.

Do **not** add a block by hand-copying another block's YAML — the
metadata schema evolves, and `/new-block` is the single place that knows
the current required fields.
