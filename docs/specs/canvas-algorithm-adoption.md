# Canvas algorithm adoption — decision record

> **Status:** decision record. Captures why and how the reference editor
> `schematic_editor.html` was adopted into the production canvas.
> **Epics:** FE-98 … FE-107 (phase P21 in `progress.frontend.yaml`).
> **Decommissioned:** `schematic_editor.html` (removed at FE-107).

A standalone, single-file vanilla-JS Canvas-2D schematic editor
(`schematic_editor.html`, ~2.6k lines) shipped genuinely better interactive
geometry than the production React/ReactFlow canvas. This record documents the
decisions (D1–D5) taken to adopt its algorithms without regressing the rest of
the application.

---

## D1 — Strategy: port the algorithms (path A), not an engine swap

**Chosen: A — port the algorithms into the existing React/ReactFlow + Zustand
canvas.** The alternative (B — wrap the Canvas-2D engine as a React component and
rip out ReactFlow) was rejected: the production canvas is integrated with a
VS Code-style shell, the `.gsim_sch` schema, the kernel IPC, the inspector, the
manifest-driven library catalog, persistence and hierarchy navigation (145
source files). A wholesale engine swap would re-bridge all of that at high risk.
Path A extracts the superior algorithms as pure, DOM-free TypeScript modules and
wires them into the existing canvas.

## D2 — Data model: `.gsim_sch`

The reference editor serialised a bespoke `{comps, wires, probes, netLabels}`
blob. All ported state is refactored onto the canonical `.gsim_sch` schema
(`packages/schemas/definitions/model/gsim_sch.schema.json`): wires use the model
`Wire` polyline shape; probes persist under `model.metadata.probes` (the
schema-sanctioned free-form object), not a top-level array.

## D3 — Keyboard: keymap-only dispatch

The reference editor's inline `document` `keydown` handler (bare `R` rotate,
`Ctrl+Y`-only redo, no contexts, no command palette) is **discarded entirely**.
All actions dispatch through `apps/frontend/src/canvas/keymap.ts` via the single
`KeymapProvider` listener. `assertNoBareLetterRotate` runs at module load to
forbid reintroducing bare-letter rotate; rotation stays `Ctrl+R` / `Ctrl+Shift+R`
per `docs/specs/keyboard-map.md`.

## D4 — Domains: map onto existing `PortKindDomain`

The reference editor's binary `phys`/`sig` domain is a strict subset of the
existing 11-value `PortKindDomain` already enforced by `port-compat.canConnect`.
No new domain concept was added: wire colour is driven from the full enum
(`wire-color.ts`, an exhaustive `Record` that guards against enum drift), and the
reference editor's reject-flash UX layers on top of `canConnect` without changing
its reason codes.

## D5 — Symbol editor: deferred to a spec

The in-canvas symbol editor was judged too complex to port now. Instead
`docs/specs/symbol-editor-spec.md` defines how a future editor must work: Form/Draw
workflow, the FE-103 primitive set, block-metadata output (no localStorage blob),
and routing any custom SPICE template through the smooth-model gate
(architecture invariant #3 — piecewise rejected at IR-1 → IR-2).

---

## Adopted algorithms

| Capability | Epic | Module |
|---|---|---|
| Orthogonal auto-router with obstacle avoidance | [FE-98](../../progress.frontend.yaml) | `canvas/router/ortho-route.ts`, `canvas/router/obstacles.ts` |
| Wire attachment, live stretch, end-segment reroute | FE-99 | `canvas/router/attachment.ts`, `canvas/selection/drag.ts` |
| Junction-dot computation and rendering | FE-100 | `canvas/edges/junctions.ts`, `canvas/edges/WireEdge.tsx` |
| Wire segment dragging with ortho re-normalisation | FE-101 | `canvas/edges/segment-drag.ts` |
| Domain wire colours + connection-reject flash | FE-102 | `canvas/edges/wire-color.ts`, `canvas/port-compat.ts` |
| Catalog-driven primitive symbol renderer | FE-103 | `canvas/nodes/primitive-renderer.ts` |
| Symbol-editor spec (deferred) | FE-104 | `docs/specs/symbol-editor-spec.md` |
| V/I probes persisted in `.gsim_sch` | FE-105 | `canvas/probes.ts`, `canvas/CanvasOverlay.tsx` |
| Keymap parity guard | FE-106 | `canvas/keymap.ts`, `canvas/KeymapProvider.tsx` |

## Discarded from the reference editor

- The inline `document.keydown` handler (bare-`R` rotate, `Ctrl+Y`-only redo).
- The `localStorage['schematic_custom_symbols']` `{comps, wires}` persistence.
- The hardcoded 24-entry `DEFS` component table (replaced by manifest/metadata).
- The symbol editor (deferred — FE-104 spec only).

---

*Decision record. The reference HTML is removed; this document and the FE-98…
FE-106 modules are its successors.*
