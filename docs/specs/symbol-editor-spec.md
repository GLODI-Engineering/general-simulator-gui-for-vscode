# Symbol Editor Specification (deferred)

> **Status:** specification only. No implementation ships with this document.
> **Epic:** FE-104. **Decision:** D5 — the in-canvas symbol editor from the
> reference `schematic_editor.html` is deferred; this spec is the contract for a
> future implementation.
> **Depends on:** FE-103 (catalog-driven primitive renderer) — the symbol
> editor's primitive model MUST match the renderer's `Primitive` union.

The symbol editor lets a user draw a custom component symbol and register it in
the library. It is the production successor to the reference editor's `se-*`
("Symbol Editor") surface. This document defines *how it must work* so it can be
built later without re-deriving the design.

---

## 1. Scope

In scope (v-next, when implemented):

- A two-step **Form → Draw** authoring workflow.
- Drawing the symbol body from a fixed **primitive set**.
- Placing **ports** with id, side, offset and kind.
- Emitting a **block-metadata-schema** entry that the catalog can load.
- Routing any custom SPICE template through the **smooth-model gate**.

Out of scope (this epic): any editor code. The deliverable is this document.

---

## 2. Authoring workflow — Form then Draw

The reference editor splits authoring into two tabs; production keeps the split.

### 2.1 Form step

Collects the metadata fields the catalog needs:

| Field | Maps to block-metadata | Notes |
|---|---|---|
| Type ID (unique key) | `name` | Stable identifier; immutable after first save. |
| Label | `label` | Human-facing name. |
| Category | `category` | Library tree placement. |
| Version | `version` | Semver string. |
| Bounding box (w, h) | `symbol.bbox` | Integer grid units. |
| Domain / paradigm | `behavior.domain`, `paradigm` | Drives default port kinds and wire colour (FE-102). |
| SPICE netlist template | `spice.netlistTemplate` (custom) | Optional; gated — see §5. |

### 2.2 Draw step

A primitive canvas where the user draws the body and drops ports. Tools mirror
the reference editor's `se-dt` toolbar: **Select, Line, Rect, Circle, Text,
Port**. Each completed primitive is appended to the symbol's primitive list.

---

## 3. Primitive set (MUST match FE-103)

The editor emits primitives from exactly the `Primitive` union defined in
`apps/frontend/src/canvas/nodes/primitive-renderer.ts`:

`line · rect · rectf · circle · arc · polygon · polyline · text`

Constraints:

- All coordinates are **integers** in block-local space, origin at the top-left
  of `symbol.bbox` (same frame as FE-103's `metadataToPrimitives`).
- A drawn symbol MUST round-trip: `renderPrimitives(primitives, { kind: "svg" })`
  and the canvas target produce identical geometry.
- The editor MUST NOT invent primitive kinds outside this union. If a richer
  shape is needed, extend the union in `primitive-renderer.ts` first and update
  this list.

---

## 4. Output is a block-metadata entry — not localStorage JSON

The reference editor persisted custom symbols to
`localStorage['schematic_custom_symbols']` as a bespoke `{comps, wires}` blob.
**This is explicitly forbidden.** The production editor MUST emit a
**block-metadata-schema** entry validating against
`packages/schemas/definitions/blocks/block-metadata.schema.json`, with at least:

- `name`, `label`, `version`, `category`, `description`
- `ports.inputs[]` / `ports.outputs[]` (id, side, offset, kind) — the drawn ports
- `symbol.bbox` and the drawn primitive geometry (stored as `symbol.shape` +
  `symbol.path`, or a future `symbol.primitives` field if the schema is extended)
- `behavior` (causality, domain, state_count, equation_template)
- optional `spice.netlistTemplate` (gated — §5)

Custom symbols are saved into the catalog through the same path as built-in
blocks; there is no parallel persistence store.

---

## 5. Smooth-model gate for custom SPICE templates

Any user-supplied `spice.netlistTemplate` (or `behavior.equation_template`) MUST
be routed through the **smooth/continuous-model gate** before the symbol is
usable in a simulation. This is **architecture invariant #3**
(`docs/agent-rules/architecture-invariants.md#smooth-models`): equation templates
must be smooth and continuous; **piecewise / region-switched models are rejected
at IR-1 → IR-2 lowering**.

Requirements:

- The editor surfaces a validation error when a template contains piecewise
  constructs (the same keywords `scripts/check-invariants.sh` greps:
  `piecewise`, `region_switch`, `if region_`, `case region`, …).
- A symbol whose template fails the gate may be **saved as a draft** but MUST NOT
  be promoted to a simulatable catalog entry.
- The gate is the IR-1 → IR-2 lowering check; the editor does not re-implement it,
  it calls/awaits the existing validation surface (optimistically, per the
  optimistic-canvas invariant — never block the canvas on it).

---

## 6. Keyboard & interaction

- Every editor action dispatches through `apps/frontend/src/canvas/keymap.ts`.
  There is **no inline `keydown` handler** (decision D3, FE-106).
- Any editor-specific chords are added to `keymap.ts` and
  `docs/specs/keyboard-map.md` with a recorded rationale; bare single-letter
  verbs (`R`, `W`, `A`, …) remain unbound per the keyboard map.

---

## 7. Deferred-scope boundary

| Capability | v-next (when built) | Out of scope |
|---|---|---|
| Form + Draw authoring | ✅ | — |
| Primitive body (FE-103 set) | ✅ | Arbitrary freehand / bezier beyond the union |
| Port placement | ✅ | Variadic/bus port wizards |
| block-metadata emit | ✅ | localStorage / bespoke blob persistence |
| Smooth-model gating | ✅ (enforced) | Bypassing the gate for "quick" templates |
| Custom SPICE template | ✅ (gated draft) | Promoting an ungated template to simulatable |

---

*Decision record. When the symbol editor is implemented, it derives from this
document, FE-103's primitive renderer, and the block-metadata schema.*
