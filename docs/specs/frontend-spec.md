# Frontend Specification — `general-simulator` v1

**Status:** Draft for implementation
**Scope:** `apps/frontend/` and the contracts it consumes (`packages/schemas/`,
JSON-RPC IPC envelope). Backend kernel, solver pipeline, synthesis, and
HDF5/LOD waveform server are out of scope here — see
[`simulator-architecture-spec.md`](./simulator-architecture-spec.md).
**v1 cutoff:** thin demo (see §1.3). Hierarchy, synthesis, FMI, and the cloud
tier are deferred behind explicit hooks documented in §15.
**Authoritative cross-references (do not duplicate):**

| Topic | Source of truth |
|---|---|
| Architectural invariants | [`AGENTS.md`](../../AGENTS.md) + [`simulator-architecture-spec.md`](./simulator-architecture-spec.md) §10 |
| Problem catalogue | [`block-diagram-gui-analysis.md`](./block-diagram-gui-analysis.md) |
| Keyboard map | [`keyboard-map.md`](./keyboard-map.md) (binding registry derives from it) |
| IR-1 / IR-2 contract | [`pipeline_IR_design.md`](./pipeline_IR_design.md) |
| OSS clean-room rules | AGENTS.md §1 (license firewall) |

---

## Table of Contents

1. [Purpose, scope, and v1 cutoff](#1-purpose-scope-and-v1-cutoff)
2. [Stack & module map](#2-stack--module-map)
3. [Canonical model store](#3-canonical-model-store)
4. [Canvas — editor surface](#4-canvas--editor-surface)
5. [Wire routing](#5-wire-routing)
6. [Rotation, mirroring, and transforms](#6-rotation-mirroring-and-transforms)
7. [Selection, copy/paste, undo/redo](#7-selection-copypaste-undoredo)
8. [Port system and inline validation](#8-port-system-and-inline-validation)
9. [Library: search-first discovery](#9-library-search-first-discovery)
10. [Property inspector](#10-property-inspector)
11. [Command palette and action search](#11-command-palette-and-action-search)
12. [Keymap registry](#12-keymap-registry)
13. [Workspace and code editor panel](#13-workspace-and-code-editor-panel)
14. [Waveform viewer](#14-waveform-viewer)
15. [IPC layer](#15-ipc-layer)
16. [File model and persistence](#16-file-model-and-persistence)
17. [Status, errors, and notifications](#17-status-errors-and-notifications)
18. [Layout shell and theming](#18-layout-shell-and-theming)
19. [Activity and bottom-panel registries](#19-activity-and-bottom-panel-registries)
20. [Accessibility](#20-accessibility)
21. [Test strategy](#21-test-strategy)
22. [Out of scope for v1](#22-out-of-scope-for-v1)

---

## 1. Purpose, scope, and v1 cutoff

### 1.1 Purpose

`apps/frontend/` is the entire user-facing product. It must:

- Run identically as a web app, a Tauri-wrapped desktop app, and (eventually)
  a paid SaaS tier — see architecture spec §9. The frontend stays
  context-unaware; only the IPC URL changes.
- Maintain an **optimistic canvas**: every edit applies to the local model
  immediately; solver/compiler validation runs asynchronously and surfaces
  via non-blocking indicators (AGENTS.md invariant 2).
- Treat the JSON graph (§3) as the **single source of truth**. The canvas,
  property panel, and code editor all read from and write to that one
  object. Desync is architecturally impossible.

### 1.2 What v1 is *not*

- Not a Modelica compiler. No acausal compiler in the frontend.
- Not a PCB layout tool.
- Not a SPICE netlist importer (v2+).
- Not an FMI 3.0 importer/exporter (v2+).
- Not the synthesis engine (block → op-amp circuit, block → C code) — that
  lives in `packages/synthesis/` and is invoked by future menu commands.

### 1.3 v1 cutoff — the "thin demo"

The user picks blocks from a search palette, wires them together
orthogonally, sets parameters in the property inspector, presses
`Ctrl+T`, and sees waveforms scroll in. End-to-end. Stub data is
acceptable for the solver path in v1 (see §15).

v1 ships when **all** of the following work:

- Drag a block from Quick Insert (`Ctrl+.` twice) onto the canvas.
- Drag from one port to another to create an orthogonal wire.
- Rotate (`Ctrl+R`), mirror (`Ctrl+I`), delete, copy/paste following the block-diagram convention
  chords from [`keyboard-map.md`](./keyboard-map.md).
- Undo and redo, including wire repair after rotate/delete.
- Edit a block's parameters in the docked property inspector; changes
  reflect on the canvas immediately.
- Save the model to a `.gsim` JSON file; reload it byte-equivalent
  through the round-trip test contract (§16.4).
- Press `Ctrl+T`; the model is serialized, sent over the IPC layer to a
  stub kernel, and a waveform appears in the uPlot panel.
- All keyboard chords in [`keyboard-map.md`](./keyboard-map.md) §1–§9 fire
  the right action in the right context.

Hierarchy, multi-tab editing, action search across the whole app, FMI,
synthesis, and live port-type validation against backend types are
post-v1.

---

## 2. Stack & module map

### 2.1 Stack (locked)

| Layer | Library | Why |
|---|---|---|
| UI framework | React 18 + TypeScript | architecture spec §3 |
| Canvas | React Flow 11.x with custom node + edge renderers | scales fine for v1 model sizes (~500 nodes); we own the renderer and router but reuse React Flow's pan/zoom, selection, viewport math |
| State | Zustand 4.x | one store per concern, no global Redux blob |
| Styling | Tailwind 3.x | utility-first, no runtime |
| Code editor | Monaco | Python syntax + autocomplete; matches Pyodide later |
| Plot | uPlot | 10M-point render in <50ms; sufficient for waveform stubs |
| Build | Vite 5.x | fast HMR |
| Test | Vitest + React Testing Library + Playwright | unit + component + e2e in one toolchain |
| Format / lint | Biome | already wired (`biome.json`) |
| Desktop wrapper | Tauri (out of frontend scope; consumed) | injects `window.__KERNEL_PORT__` |

### 2.2 Folder layout

The scaffold already exists. The spec locks these conventions:

```
apps/frontend/src/
├── main.tsx                  app entry; mounts <App/>
├── App.tsx                   layout shell (top bar, side panels, canvas)
├── canvas/                   editor surface
│   ├── Canvas.tsx            React Flow host
│   ├── nodes/                custom node renderers (one per block family)
│   ├── edges/                orthogonal wire edge renderer
│   ├── router/               router algorithms (interactive + cleanup)
│   ├── snapping/             grid + anchor snap helpers
│   ├── transforms/           rotate, mirror, flip
│   ├── selection/            marquee, bbox, port hit-testing
│   └── keymap.ts             binding registry; derived from keyboard-map.md
├── store/                    Zustand stores (graph, ui, ipc, library)
├── model/                    JSON graph types + (de)serialization
├── library/                  block catalog + Quick Insert UI
├── inspector/                property inspector (docked + Alt+Enter focus)
├── palette/                  Ctrl+. command + action search UI
├── workspace/                Monaco code editor + variable list
├── waveform/                 uPlot viewer + LOD client (stub in v1)
├── ipc/                      JSON-RPC over WebSocket client + stub
├── synthesis/                placeholder; menu hooks only in v1
└── code-editor/              (kept as scaffolded; merged into workspace/)
```

`packages/schemas/definitions/model/` owns the `.gsim` file schema. The
frontend imports the generated TypeScript types from
`packages/schemas/generated/typescript/`. **The schema is the contract; the
frontend never invents types that should be in the schema.**

---

## 3. Canonical model store

### 3.1 Why one store

The OpenModelica/OMEdit family failed (problem §2) because the GUI cached
its own copy of the model and wrote back destructively. We will not. The
**graph store** is the canonical in-memory representation; the canvas, the
inspector, save/load, and IPC all read and write through it.

### 3.2 Store contract

`store/graph.ts` exposes one Zustand store with this surface (TypeScript
types live in `packages/schemas/generated/typescript/`):

```ts
type Block = {
  id: string                  // UUID v4, stable across save/load
  type: string                // catalog key, e.g. "control.pid"
  position: [number, number]  // INTEGER canvas units; no floats
  rotation: 0 | 90 | 180 | 270
  mirror: "none" | "x" | "y"
  params: Record<string, ParamValue>
}

type Wire = {
  id: string
  from: { block: string; port: string }
  to:   { block: string; port: string }
  waypoints: Array<[number, number]>  // INTEGER; orthogonal pairs
  pinned: boolean                     // user-pinned bends survive moves
}

type GraphState = {
  blocks: Record<string, Block>
  wires:  Record<string, Wire>
  // ── mutations (the ONLY way the graph changes) ────────────────
  addBlock(b: Block): void
  moveBlocks(ids: string[], delta: [number, number]): void
  rotateBlocks(ids: string[], dir: "cw" | "ccw"): void
  mirrorBlocks(ids: string[], axis: "x" | "y"): void
  deleteBlocks(ids: string[]): void
  addWire(w: Wire): void
  rerouteWire(id: string, waypoints: Array<[number, number]>): void
  deleteWires(ids: string[]): void
  setParam(blockId: string, key: string, value: ParamValue): void
  // ── transactional batching ────────────────────────────────────
  transact(name: string, fn: () => void): void
}
```

### 3.3 Rules

1. **Integer coordinates only.** Any code that writes a float to
   `position` or `waypoints` is a bug. The Xcos save/load corruption
   pattern (problem §10) is rooted in float coordinates.
2. **No private state.** The canvas does not store its own copy of node
   positions. The React Flow `nodes` array is *derived* from `blocks`
   every render via a selector.
3. **All mutations go through `transact`.** A single user gesture (drag,
   rotate, paste) is exactly one transaction, named for the undo log.
4. **No async in mutations.** Async work (validation, IPC) reads the
   store, computes a result, then dispatches a separate mutation if
   needed. Mutations never await.

### 3.4 Other stores

| Store | Scope |
|---|---|
| `store/ui.ts` | selection set, hover, zoom, pan, active panel, modal stack |
| `store/library.ts` | block catalog (loaded once from `packages/blocks`), recently used queue, search index |
| `store/ipc.ts` | kernel status (`idle`/`busy`/`error`), pending request ids, last simulation results manifest |
| `store/inspector.ts` | which selection the panel is bound to; dirty edits before commit |

UI state, library state, and IPC state are **separate stores** so the
graph store stays minimal and round-trippable.

---

## 4. Canvas — editor surface

### 4.1 Render model

- React Flow 11 hosts the canvas; `nodeTypes` and `edgeTypes` are
  registered with our custom renderers.
- The canvas reads `blocks` and `wires` from the graph store via Zustand
  selectors. On change, React Flow re-renders the affected nodes/edges.
- We do **not** use React Flow's built-in `applyNodeChanges`/
  `applyEdgeChanges` mutation path. Every change routes through our
  graph store first; React Flow renders the consequence.

### 4.2 Coordinate system

- One canonical unit: **canvas unit** = 1/10 mm equivalent (i.e. our
  "grid step" defaults to 10 canvas units). All persisted positions are
  in canvas units, integer.
- View transform: pan + zoom only. Zoom factor is rendered-only and is
  **not** persisted in the model. Zoom and pan are stored in `ui.ts` and
  survive within the session but are not part of the `.gsim` file.
- Per-document grid spacing (default 10) is **persisted in the file**,
  not in user preferences. Xcos lost collaborators by storing grid only
  in editor prefs (research/xcos/coordinate-system-grid-snapping §
  edge cases).

### 4.3 Grid + snap

- Default grid: 10 × 10 canvas units.
- Visible grid: dots at every grid point; gridlines thinned by zoom (one
  in every N dots when zoom < threshold).
- **Grid visibility is decoupled from snap** (Qucs lesson). The user can
  hide the grid and still get snap; can show the grid and disable snap.
- Snap targets, in priority order:
  1. Existing port (highest priority — beats raw grid)
  2. Existing wire body (creates a junction on commit)
  3. Grid point
- Multi-item drag uses the **coarsest grid among the selection** (KiCad
  lesson) to prevent drift when moving block + decoration together.

### 4.4 Node renderer

One renderer per block family (`canvas/nodes/PIDNode.tsx`,
`canvas/nodes/GainNode.tsx`, etc.). Renderers must:

- Accept `data: { block: Block; ports: PortLayout }` props (from a
  selector); never reach into the store directly.
- Render the symbol as SVG. Symbol geometry is data-driven from the
  block catalog, not hard-coded per renderer (a single
  `<BlockSymbol/>` renders any catalog entry; renderers exist only for
  blocks with non-rectangular shapes).
- Apply rotation + mirror via a CSS `transform` on the wrapping `<g>`,
  not by rewriting port coordinates. Port coordinates in the store stay
  in the block-local frame; the canvas transforms them at render time.

### 4.5 Interaction latency budget

Hard target: every canvas gesture must produce a frame in **≤16 ms**
(architecture spec §4). No mutation may call into the solver, the
compiler, or any awaitable backend. Background validation is a separate
worker task that posts results into `store/ipc.ts`.

---

## 5. Wire routing

### 5.1 Why this matters

Wire routing is the most visible "feel" signal in a schematic editor.
Xcos's save/load wire jumble (problem §5/§10) and Qucs's lack of
post-move cleanup (research/qucs/wire-routing) are the cautionary tales
we will not repeat.

### 5.2 Interactive draw (port → port)

1. User starts a wire by dragging from a port. The cursor enters
   "drawing wire" mode.
2. While dragging, a **two-segment orthogonal preview** is shown from
   the start port to the snapped cursor position. First leg posture
   (horizontal-first vs vertical-first) is chosen by larger axis delta,
   user-togglable with `/` (KiCad's posture toggle, adopted).
3. Commit (release on port, or on wire body, or on canvas):
   - On port: snap to port, finalize as straight-segment route.
   - On wire body: split target wire at hit point, insert a junction
     node, finalize.
   - On canvas: cancel (no orphan wires).
4. After commit, the wire's `waypoints` are stored as an integer
   polyline. `pinned: false`.

### 5.3 Post-move cleanup

Whenever a block moves (one mutation in the store), all wires connected
to that block re-route deterministically:

- **Unpinned wires:** recomputed from scratch by the orthogonal router
  (a 2-bend Manhattan path between current port positions, posture
  preserved when possible).
- **Pinned wires:** the pinned bend(s) stay put; only the leg segments
  between pin and port reflow.

This avoids Qucs's "awkward local stretch" (research/qucs/wire-routing
§"What we'd do differently") and Xcos's spaghetti on save/load.

### 5.4 User-pinned bends

- Right-click on a wire segment → "Pin bend here". Sets `pinned: true`
  and adds an explicit waypoint at the segment midpoint.
- Drag any waypoint to move it; waypoint coordinates are integer-snapped
  to grid.
- `Backspace` while hovering a pin removes the pin (wire reverts to
  auto-routed).

### 5.5 Constraints

- **All segments are axis-aligned.** Diagonal wires are not permitted.
  The renderer refuses to render a non-orthogonal `waypoints` list.
- **Determinism.** Given the same port positions and pin set, the
  router produces the same waypoint list every time. Required for the
  save/load round-trip test (§16.4).
- **No obstacle avoidance in v1.** Wires may cross block bodies; we
  visually flag this with a soft warning highlight but do not re-route
  around it. Obstacle avoidance is v2.

---

## 6. Rotation, mirroring, and transforms

### 6.1 Bindings

From [`keyboard-map.md`](./keyboard-map.md) §8:

| Action | Chord |
|---|---|
| Rotate CW 90° | `Ctrl+R` |
| Rotate CCW 90° | `Ctrl+Shift+R` |
| Flip | `Ctrl+I` |

### 6.2 Pivot policy

(Resolved in `keyboard-map.md` §8 — restating here for the implementer.)

- **Single block selected:** pivot = block's own anchor (top-left of
  unrotated bounding box, before transform). Avoids the Qucs drift
  problem (research/qucs/coordinate-system-and-grid).
- **Multi-selection:** pivot = selection bounding-box centre, snapped
  to the active grid.
- Mirroring uses the same rule, with H/V axis through the pivot point.

### 6.3 Port recomputation

After transform:

1. Block's `rotation` and `mirror` fields are updated in the store.
2. Port coordinates in the **store** remain in block-local frame
   (unchanged); the canvas re-renders ports through the transform
   matrix.
3. Connected wires re-route via §5.3 post-move cleanup; pinned bends
   stay pinned in canvas space.

### 6.4 Group transforms

Group rotation rotates each block around the group pivot:

- Block centre rotates around pivot.
- Block's own `rotation` increments (CW: +90°, CCW: -90°, mod 360).
- Mirror toggles `mirror` on each block; flag interaction with rotation
  is documented in `canvas/transforms/composition.md`.

---

## 7. Selection, copy/paste, undo/redo

### 7.1 Selection

- Click on block: select that block; clear previous selection unless
  `Shift` or `Ctrl` held.
- Marquee: click-drag on empty canvas; selects all blocks whose
  bounding box intersects the marquee; wires whose both endpoints are
  in selected blocks.
- `Ctrl+A`: select all (architecturally a `selectAll` action; not a
  store mutation).
- `Ctrl+Alt+A`: clear selection.
- Keyboard arrow keys move the selection by one grid step
  (`Shift+Arrow` = 10 steps), per `keyboard-map.md` §3.

### 7.2 Copy / paste / cut

- `Ctrl+C`: serialize selected blocks + their interior wires (wires
  with both endpoints in the selection) to clipboard as a JSON
  fragment matching the file schema.
- `Ctrl+V`: deserialize; assign fresh UUIDs; paste at cursor (snapped);
  select the pasted set.
- `Ctrl+X`: same as `Ctrl+C` followed by delete.
- Clipboard format is **identical** to the on-disk file fragment
  format. The clipboard is just a `.gsim` slice. This is the same
  principle as KiCad's clipboard reduction-variant of the file format.

### 7.3 Undo / redo

- Implementation: **graph-state diffs**, not command objects.
- Each `transact(name, fn)` call:
  1. Snapshots the relevant slices before `fn` runs.
  2. Runs `fn`.
  3. If the post-state differs, pushes `{name, before, after}` to
     the undo stack and clears the redo stack.
- Replay (undo/redo) applies the diff to the store. The canvas, the
  inspector, and any waveform overlays re-render from the resulting
  graph state.
- Undo must **also restore connection topology** (KiCad lesson,
  research/kicad/undo-redo). Diff-based restoration gives this for
  free because wires are part of the diff.
- File operations (`Ctrl+N`, `Ctrl+O`, kernel restart) **clear** the
  undo stack and prompt the user before doing so.

---

## 8. Port system and inline validation

### 8.1 Port types

Each port carries:

```ts
type PortKind =
  | { domain: "signal";     dims: "scalar" | { vector: number } | "matrix" }
  | { domain: "electrical" }
  | { domain: "thermal" }
  | { domain: "mechanical" }
  | { domain: "event" }
```

Ports declare their kind in the block catalog. The kind is **not**
inferred from data flow.

### 8.2 Compatibility check on draw

When the user drags from port A and hovers over port B:

- Compatible: kind domains match; for `signal`, dimensions are
  compatible (scalar↔scalar, vector[n]↔vector[n], or scalar→broadcast
  to vector with explicit cue).
- Incompatible: cursor reverts to a forbidden cue (red overlay), port
  B is *not* highlighted as a snap target. Drop on B silently cancels
  the wire.

This is the engineering-flow win from problem §6: the user never
discovers a type mismatch at simulation time.

### 8.3 Validation surfaces

- **Sync, local:** port domain + dimension match. Done by the canvas
  before commit. ≤1 ms.
- **Async, backend:** symbolic checks (algebraic loop detection, DAE
  index estimate). v2+. The frontend reserves the protocol
  (`store/ipc.ts` already has a slot for `validation_report`) but
  v1 does not surface them.

### 8.4 Connectivity model

Geometric and semantic connectivity are computed separately
(research/qucs/connection-rules §"What we'd do differently"):

- **Geometric:** ports/wires at the same coordinate share a topological
  node. Computed by the graph store, used by the canvas and the
  exporter to IR-1.
- **Semantic:** port kind matches. Computed at connection-draw time;
  re-checked on load.

Wire crossings without an explicit junction are **not** connections.
Junctions render as visible dots (per Qucs lesson).

---

## 9. Library: search-first discovery

### 9.1 v1 block catalog

The minimum 10 blocks for the thin demo, drawn from the control palette
(matching `packages/blocks/src/blocks/control` and `signal`):

| Catalog key | Symbol | Ports | Key params |
|---|---|---|---|
| `signal.constant` | constant value source | 0 in / 1 out (scalar) | `value` |
| `signal.step` | step input | 0 in / 1 out (scalar) | `t_step`, `before`, `after` |
| `control.gain` | scalar gain | 1 in / 1 out | `k` |
| `control.sum` | summer | n in / 1 out | `signs` (e.g. `[+,-]`) |
| `control.integrator` | integrator | 1 in / 1 out | `x0`, `limits?` |
| `control.derivative` | derivative | 1 in / 1 out | — |
| `control.pid` | PID | 1 in / 1 out | `kp`, `ki`, `kd`, `anti_windup` |
| `control.transfer_function` | rational H(s) | 1 in / 1 out | `num`, `den` |
| `control.saturation` | clamp | 1 in / 1 out | `lo`, `hi` |
| `sink.scope` | scope | 1 in / 0 out | `t_window` |

The catalog source-of-truth is `packages/blocks/src/blocks/<family>/<name>/metadata.yaml`,
shared with the Python kernel. The frontend imports the generated
TypeScript catalog manifest at build time.

### 9.2 Quick Insert (the load-bearing UX)

`Ctrl+.` twice → opens a centered modal at the canvas cursor with:

- Search input, autofocus.
- Fuzzy-matched results: name, alias, tags. Ranked by:
  1. Recently used (recency-decayed)
  2. Exact-prefix match
  3. Substring match
  4. Fuzzy (Levenshtein, tolerant)
- Arrow keys + `Enter` to insert at cursor.
- Escape to cancel.

The Quick Insert palette is the **primary** path to add a block.
Double-clicking the canvas background is an alias.

### 9.3 Library sidebar (secondary)

A collapsible tree on the left edge:

- Categories: `Signal`, `Control`, `Power`, `Sinks`, `Subsystems`,
  `User` (the last two are stubs in v1).
- Click a category to filter the search palette to it; drag from tree
  to canvas as the standard alternative.
- The tree is not the primary discovery path. Default state in v1:
  collapsed.

### 9.4 Block tooltip

Hovering a catalog entry shows a tooltip with:

- One-line description.
- Port summary.
- Key parameter names.
- "Press Enter to insert at cursor" / "Drag to place".

No external browser links in v1; in-app docs come v2.

---

## 10. Property inspector

### 10.1 Docked panel (primary)

Right side, ~320 px wide, persistent. Bound to the current selection:

- 0 blocks selected: panel shows model-level settings (grid spacing,
  simulation duration stub).
- 1 block selected: panel shows that block's parameters with inline
  editors (text, number, dropdown, vector input).
- N > 1 blocks selected: panel shows shared parameters; edits apply to
  all selected blocks.

Edits commit to the store **on blur or Enter**, not on every keystroke,
to keep undo granular.

### 10.2 `Alt+Enter` — main parameter focus

Per the block-diagram convention and `keyboard-map.md` §6:

- Pressing `Alt+Enter` with a single block selected focuses the *main*
  parameter of that block (declared in the catalog's metadata YAML as
  `main_param`).
- The user types the new value and presses Enter; commit and unfocus.

This is the keyboard-driven inline edit lane. No modal opens.

### 10.3 Property panel toggle

`Ctrl+Shift+I` toggles panel visibility (convention-aligned).

### 10.4 Validation in the inspector

- Local: type and range checks done synchronously; invalid input shows
  red border + tooltip with reason.
- Async: future backend symbolic validation (deferred). When it
  arrives, an `<InspectorStatus/>` strip at the bottom of the panel
  will show it.

---

## 11. Command palette and action search

`Ctrl+.` (single press) → opens a centered command palette listing
**every registered action** in the keymap registry. Fuzzy search by
action label or action id. Selecting an action invokes it in the
current canvas context.

Use cases:

- Discover an action whose chord the user forgot.
- Trigger an action that has no chord (e.g., "Export as PNG" in v2).
- Migrators (Qucs/KiCad users) can type "rotate" and pick our chord
  instead of stabbing `R` and getting nothing.

Implementation note: the palette draws its action list from the keymap
registry (§12) so adding an action automatically surfaces it here.

---

## 12. Keymap registry

### 12.1 Authority

[`keyboard-map.md`](./keyboard-map.md) is the source of truth. The
registry encoding lives at `apps/frontend/src/canvas/keymap.ts`. Drift
between the two is a CI-checkable concern (see §20.4).

### 12.2 Registry shape

```ts
type ActionId = string  // dot.notation, e.g. "canvas.rotate.cw"

type Binding = {
  id: ActionId
  chord: string           // block-diagram-style, e.g. "Ctrl+R"
  contexts: Context[]     // when this binding applies
  handler: (ctx: ActionContext) => void
}

type Context =
  | "global"
  | "canvas"
  | "selection"
  | "drawing-wire"
  | "in-place-edit"
  | "modal"
```

### 12.3 Dispatch

A single keydown listener at the top of the React tree:

1. Resolve the active context from focus + UI state.
2. Look up the binding by `(chord, context)`.
3. If found, `preventDefault()` and call the handler.
4. If not, fall through to default browser behavior.

### 12.4 Conflict guard

The registry refuses to start if two bindings claim the same
`(chord, context)` pair. Caught at module load. This is the same
guard the keymap spec mandates.

### 12.5 User override (post-v1)

Reserved hook: `~/.config/general-simulator/keymap.json` may override
the chord of any binding by `ActionId`. Action IDs are stable across
releases. In v1 the override file is read but the UI to author it is
post-v1.

---

## 13. Workspace and code editor panel

The Workspace is the **`core.workspace` bottom-panel tab** (§19.2).
Focus chord: `Ctrl+Shift+6`. It is the only place the Python REPL
("command window") lives in the v1 UI.

### 13.1 Layout

Tab content: stacked, full tab width.

```
┌─ Variable list ────────────────────────────┐
│ V_out   ndarray  float32  (10000,) [0.0,...]│
│ Kp      float    2.5                       │
│ ...                                        │
├─ Monaco editor ────────────────────────────┤
│ # Python — runs in kernel namespace        │
│ Kp = 2.5                                   │
│ plt.plot(t, V_out)                         │
└────────────────────────────────────────────┘
```

### 13.2 Workspace variable list

Read from `store/ipc.ts`. Each `workspace_update` IPC message replaces
the list. Clicking a variable issues `workspace_get` for the full
value; result renders inline (number, array preview, table).

v1 ships **stubbed** variable updates from a fixture kernel so the UI
can be developed before the real sidecar.

### 13.3 Monaco code editor

- Monaco loaded via `@monaco-editor/react` (already a dep).
- Python language mode.
- `Shift+Enter` evaluates the current cell-equivalent (selected text
  or current line) — sends `execute` IPC message.
- `Ctrl+Enter` evaluates the whole buffer.
- Output stream appears below the editor in a console-like region.

v1 stub: the IPC layer echoes a canned response so the UI is testable
without Pyodide or the sidecar.

---

## 14. Waveform viewer

The waveform viewer is the **`core.waveform` bottom-panel tab**
(§19.2). Focus chord: `Ctrl+Shift+5`. It auto-opens (and the bottom
panel auto-expands) the first time a `simulate_result` arrives.

### 14.1 Layout

Tab content: full tab width, resizable via the bottom panel's own
resize handle.

### 14.2 uPlot integration

- Time on x-axis, value on y-axis.
- One trace per `signal` selected. Trace toggles in a side legend.
- Cursor + crosshair shows instantaneous value at cursor x.
- Pan (drag), zoom (wheel), reset (double-click).

### 14.3 LOD client (stub in v1)

The architecture spec defines the LOD/HDF5 server (architecture spec
§7). The frontend will eventually request slices:

```
GET /results/{sim_id}/signals
    ?signals=V_out,I_L
    &t_start=...
    &t_end=...
    &max_points=3000
```

In v1, the IPC stub returns a precomputed signal of ~3000 points.
The viewer treats it as Level-3 LOD and renders directly. The LOD
prefetch logic and binary frame handling are coded into the
`waveform/` module but exercised against the stub.

### 14.4 First paint

When a simulation result manifest arrives (post-`Ctrl+T`), the viewer:

1. Auto-selects the first scope's signal.
2. Sets x-range to `[t_start, t_end]` from manifest.
3. Issues the slice request; renders on response.

---

## 15. IPC layer

### 15.1 Transport

- **Production:** JSON-RPC over WebSocket to `ws://127.0.0.1:<port>`
  on desktop (port injected via `window.__KERNEL_PORT__`), or to the
  configured cloud URL on web paid tier.
- **v1 dev:** an in-process stub kernel that satisfies the same
  envelope. Selected at build time via env var
  `VITE_IPC_TRANSPORT=stub|ws`.
- **Token handshake:** the kernel injects a one-time token via
  `window.__KERNEL_TOKEN__`; the client includes it in the initial
  WS upgrade handshake or first message. Anti-coresident-process
  protection on localhost.

### 15.2 Envelope (matches architecture spec §6)

```ts
type Message = {
  id: string           // UUID; correlates request/response/stream
  type: MessageType
  payload: unknown
}
```

Message types (frontend → kernel, kernel → frontend) are as defined in
architecture spec §6 tables. The frontend layer must:

- Support **streaming** replies: the same `id` may receive an
  `execute_stream` chunk, then an `execute_result` terminator.
- Support **binary frames** with the 128-byte JSON header + raw array
  body. Detected via `event.data instanceof ArrayBuffer`. Parse header
  to typed array.
- Be cancellable: `execute_cancel` for any pending `id`.
- Expose a typed client surface:

```ts
const ipc = useIPC()
const result = await ipc.execute(code)         // returns ExecuteResult
const value  = await ipc.workspaceGet(name)    // returns binary-decoded
ipc.subscribe("workspace_update", listener)
```

### 15.3 Connection lifecycle

| State | Meaning | UI cue |
|---|---|---|
| `disconnected` | No socket yet | gray dot, "Kernel offline" |
| `connecting` | Socket opening + handshake | yellow pulse |
| `idle` | Connected, no pending work | green dot |
| `busy` | One or more pending `execute` | green spinner |
| `error` | Connection lost or handshake failed | red dot, retry button |

Status is read from `store/ipc.ts` and shown in the bottom status bar
(§17).

### 15.4 Stub kernel (v1)

`ipc/stub/` provides a fake kernel implementing the envelope:

- `execute` echoes a canned result + a stub waveform manifest.
- `workspace_get` returns canned arrays.
- `kernel_status` toggles idle/busy on a timer to exercise UI states.

The stub is used by Vitest unit tests and Playwright e2e tests
unmodified.

---

## 16. File model and persistence

### 16.1 Format: `.gsim` JSON

```jsonc
{
  "schema_version": 1,
  "model": {
    "id": "uuid-of-model",
    "name": "Buck converter loop",
    "grid": 10,
    "blocks":  [ /* Block[] */ ],
    "wires":   [ /* Wire[] */ ],
    "metadata": { /* free-form, e.g. simulation params */ }
  }
}
```

- Versioned at the top level. The loader rejects unknown
  `schema_version` values; the writer always writes the current
  version.
- Field order is **canonical** — keys sorted alphabetically at each
  level. Required so `git diff` stays meaningful and the round-trip
  test (§16.7) is byte-comparable.
- Integers only for coordinates. The JSON encoder MUST refuse to
  serialize floats in coordinate slots.

### 16.2 Schema location

`packages/schemas/definitions/model/gsim.schema.json`. The frontend
imports generated TypeScript types. The Python kernel imports
generated Pydantic models. **Both sides** validate against the schema
on load and on save.

### 16.3 Two storage contexts, one adapter

The `.gsim` format and the serializer/deserializer code are
**identical** across desktop and web. What differs is *where* the
bytes land. The frontend defines a single storage-adapter interface:

```ts
interface StorageAdapter {
  list():               Promise<ModelEntry[]>        // recent / known models
  load(id: ModelRef):   Promise<ModelDocument>
  save(id: ModelRef,
       doc: ModelDocument):  Promise<void>
  saveAs(doc: ModelDocument): Promise<ModelRef>      // user picks destination
  delete(id: ModelRef): Promise<void>
  importFromFile():     Promise<ModelDocument>       // user picks a .gsim file
  exportToFile(doc: ModelDocument): Promise<void>    // user downloads a .gsim file
}
```

Two implementations:

| Adapter | Where it runs | Backing store |
|---|---|---|
| `TauriFsAdapter` | Desktop (Tauri) | OS filesystem via Tauri's `fs` + `dialog` plugins |
| `IndexedDbAdapter` | Web (browser) | IndexedDB workspace |

Selected at app boot via a feature detect: `window.__TAURI__` exists
→ TauriFsAdapter; else → IndexedDbAdapter. The rest of the frontend
never inspects which adapter it has.

### 16.4 Desktop adapter (Tauri filesystem)

Standard filesystem semantics, no surprises:

- `Save` writes to the current path; `Save As` opens the native save
  dialog. `Open` opens the native open dialog.
- The `ModelRef` is the absolute file path.
- `Recent` list is persisted in Tauri's app-data dir as a JSON file.
- `Import` and `Export` are functionally `Open` and `Save As` —
  they exist for UX parity with web.

### 16.5 Web adapter (IndexedDB workspace)

The web tier has no persistent filesystem from the user's side; the
adapter persists into IndexedDB and treats files as
**Import/Export only**. This matches Excalidraw, Falstad/CircuitJS,
and draw.io — and avoids the File System Access API's known
fragility (Safari does not support it; Firefox does not support it;
permissions reset between sessions in Chrome).

**Workspace database** (IndexedDB name: `general-simulator`):

```
└── models (object store, keyPath = "id")
    ├── { id, name, document: <ModelDocument>, modifiedAt, openedAt }
    └── …
```

Object-store entries are versioned by `modifiedAt`. The frontend's
**auto-save** flushes the current model on every `transact()`
commit, debounced to 500 ms. `Ctrl+S` forces an immediate flush.
This means a tab-close never loses unsaved work, and "Save" feels
the same on web as on desktop, even though it never reaches a file.

**Recent models picker.** On app launch, the IndexedDbAdapter
queries `models` ordered by `openedAt`. A startup card lists the
most recent N models; the user picks one or opens a new empty model.

**Importing a .gsim file** (`Ctrl+O`). Opens a `<input type=file
accept=".gsim,.json">` picker; parses + validates; assigns the
imported model a fresh entry in `models`; treats it as the active
model. Original file is not tracked; subsequent saves stay in
IndexedDB. To "save the changes back to the file the user opened",
the user re-Exports (`Ctrl+Shift+E`).

**Exporting** (`Ctrl+Shift+E`). Serializes the active model and
triggers a browser download via a synthetic `<a download>` click.
Filename derives from `model.name` with `.gsim` extension.

**Workspace export** (deferred to post-v1). A future menu item
"Export workspace as zip" bundles every model in IndexedDB into one
download. Out of scope for the v1 cutoff.

### 16.6 File operations (v1)

| Action | Chord | Desktop behavior | Web behavior |
|---|---|---|---|
| New | `Ctrl+N` | Confirm-discard; reset graph and UI stores; new model is untitled | Same; new IndexedDB entry created on first save |
| Open | `Ctrl+O` | Native file picker; load + validate | **Workspace picker modal** showing recent models; "Import .gsim file…" option in the same modal |
| Save | `Ctrl+S` | Save to current path; or Save As if untitled | Force-flush to IndexedDB |
| Save As | `Ctrl+Shift+S` | Native save dialog | "Duplicate as…" — clone current model with new name in workspace |
| Export | `Ctrl+Shift+E` | Native save dialog (writes .gsim) | Trigger browser download of .gsim |
| Close | `Ctrl+W` | Confirm-discard; close current model | Same |

Confirm-discard logic checks the dirty flag in the graph store. On
web with auto-save, "dirty" is effectively zero after each
transaction completes, so the prompt almost never appears.

### 16.7 Round-trip test contract

A CI test that:

1. Generates a property-based random graph (small, but covering all
   block types and various wire pin/no-pin configurations).
2. Serializes it.
3. Deserializes it into a fresh store.
4. Re-serializes the fresh store.
5. Asserts byte-equivalence of (2) and (4).

If a property cannot be made round-tripped, that's a schema design
error. Fix the schema, not the test.

Both adapters are exercised:

- Tauri adapter: tested via a Vitest harness that mocks the Tauri
  filesystem API with an in-memory map.
- IndexedDB adapter: tested against `fake-indexeddb` in Vitest and
  against real IndexedDB in Playwright.

---

## 17. Status, errors, and notifications

### 17.1 Status bar (bottom)

Left → right:

- Kernel status dot + label (§15.3).
- Current zoom level + reset button.
- Validation summary: "✓ Clean" / "⚠ 3 warnings" / "✗ 1 error"; click
  to open the diagnostics panel.
- Cursor coordinates (in canvas units), updated on hover.

### 17.2 Diagnostics panel

A collapsible bottom panel (toggle in status bar) listing every
inline validation issue with:

- Severity (info/warn/error).
- Location (block id + port, or wire id).
- Message.
- "Reveal" button: pans the canvas to the location, selects the item.

### 17.3 Error messages — translation policy

(Architecture spec §10 principle 10.)

- The kernel/solver may emit raw tracebacks; the frontend **never**
  shows them by default. An error message has a human-readable
  summary plus a "Show details…" disclosure.
- A translation table in `ipc/error-map.ts` matches known patterns
  (e.g. `singular matrix` → "Algebraic loop detected: …") and
  rewrites them. Patterns are added as we discover them.

### 17.4 Toasts

Non-blocking transient messages for successful save, kernel
reconnected, copy/paste confirmation. Library: `sonner` or
hand-rolled (single component, no library needed in v1).

---

## 18. Layout shell and theming

### 18.1 Shell — VS Code-style

```
┌──────────────────────────────────────────────────────────┐
│ Top bar — file menu | edit | sim | help | run button     │
├──┬─────────────┬────────────────────┬────────────────────┤
│⊟ │             │                    │                    │
│⌕ │  Active     │                    │   Inspector        │
│⊞ │  activity   │      Canvas        │   (secondary       │
│⚠ │  side bar   │                    │    side bar)       │
│  │             │                    │                    │
├──┴─────────────┴────────────────────┴────────────────────┤
│ Waveform | Workspace | Output | Problems   ← tab strip   │
│  active-tab content                                      │
├──────────────────────────────────────────────────────────┤
│ Status bar                                               │
└──────────────────────────────────────────────────────────┘
```

Regions, left → right, top → bottom:

| Region | Behavior |
|---|---|
| **Top bar** | Global menus + run/stop simulate buttons. Always visible. |
| **Activity bar** | Far-left vertical icon strip. Each icon selects an *Activity* whose component fills the primary side bar. Always visible. |
| **Primary side bar** | Renders the active activity's component. Resizable. Toggled by `F6`. |
| **Canvas** | Center; the schematic editor (§4–§8). |
| **Secondary side bar** | Right; the Property Inspector (§10) by default. Resizable. Toggled by `F8` (alias `Ctrl+Shift+I`). |
| **Bottom panel** | Tab strip + active-tab content. v1 tabs: Waveform, Workspace, Output, Problems. Resizable. Toggled by `F7`. Tabs switchable by click or `Ctrl+Shift+5..8`. |
| **Status bar** | §17.1. Always visible. |

### 18.2 Activity bar (v1 built-ins)

Per [`keyboard-map.md`](./keyboard-map.md) §16, focus chords are
`Ctrl+Shift+<n>`:

| Order | Activity | Icon | Chord | Content |
|---|---|---|---|---|
| 1 | Explorer | ⊟ | `Ctrl+Shift+1` | Recent models list (from `StorageAdapter.list()`), hierarchy tree when subsystems land (post-v1) |
| 2 | Search | ⌕ | `Ctrl+Shift+2` | Find blocks / wires / parameters in the current model |
| 3 | Library | ⊞ | `Ctrl+Shift+3` | Block catalog tree (§9.3) |
| 4 | Problems | ⚠ | `Ctrl+Shift+4` | Same issues list the Problems bottom tab shows (§18.3) — opening one focuses the other |

### 18.3 Bottom panel (v1 built-ins)

| Order | Tab | Chord | Content |
|---|---|---|---|
| 1 | Waveform | `Ctrl+Shift+5` | uPlot viewer (§14) |
| 2 | Workspace | `Ctrl+Shift+6` | Variable list (top) + Monaco Python REPL (bottom) (§13) |
| 3 | Output | `Ctrl+Shift+7` | Kernel stdout / stderr stream + IPC log |
| 4 | Problems | `Ctrl+Shift+8` | Validation issues list with Reveal action (§17.2) — shares state with the Problems activity |

### 18.4 Default visibilities (cold start)

| Region | Default |
|---|---|
| Activity bar | visible |
| Primary side bar | visible; Library activity active |
| Secondary side bar | hidden; auto-opens on first selection or via `Ctrl+Shift+I` |
| Bottom panel | hidden; auto-opens after first `Ctrl+T` (Waveform tab) |
| Status bar | visible |

### 18.5 Persistence

Region sizes (when visible), the active activity, and the active
bottom-panel tab are persisted in the UI store and survive within a
session. Beyond the session:

- Desktop: persisted in Tauri app-data.
- Web: persisted in IndexedDB alongside the workspace (§16.5).

### 18.6 Theming

- Single neutral light theme in v1.
- All colors are Tailwind variables. Adding a dark mode is just a
  Tailwind `dark:` class sweep; we do not gate v1 on it.
- Schematic ink: black on white canvas. Selected items: blue
  outline. Junctions: black dots. Pinned wire bends: a small square
  marker at the pinned point.
- Activity bar icons: monochrome glyphs at 24 px; active icon gets a
  left-edge accent stripe (VS Code convention).

### 18.7 Block symbol style

- Sharp 90° corners (engineering convention).
- 1.5 px stroke at unit zoom; scales with zoom.
- Port markers: 4 px filled circles, color-coded by domain (signal =
  blue, electrical = red, thermal = orange, mechanical = grey, event
  = green).
- Text inside blocks: 12 px system font.

---

## 19. Activity and bottom-panel registries

Two registries (modeled on the keymap registry, §12) provide the
extension surface for the activity bar and the bottom panel. v1
ships built-in entries only; an extension loader is reserved
post-v1.

### 19.1 Activity registry

```ts
type ActivityId = string  // dot-namespaced, e.g. "core.library"

type Activity = {
  id:        ActivityId
  icon:      ReactNode
  label:     string
  component: React.ComponentType<{}>
  order:     number          // ascending; ties broken by lexicographic id
  contexts?: Context[]       // when the activity is selectable; default: always
}
```

v1 built-ins (stable ids):

| id | Order |
|---|---|
| `core.explorer` | 10 |
| `core.search` | 20 |
| `core.library` | 30 |
| `core.problems` | 40 |

Rules:

- IDs are namespaced. `core.*` is reserved for built-ins. Future
  extensions must use their own prefix.
- A boot-time **conflict guard** throws on duplicate id.
- Tie-breaking is deterministic (alphabetical by id) so the activity
  bar ordering never depends on registration order.
- Hiding an activity (via UI store flag) is allowed without
  unregistering; this is how a future user-customisation UI will
  work.

### 19.2 Bottom-panel tab registry

```ts
type BottomTabId = string  // dot-namespaced, e.g. "core.waveform"

type BottomTab = {
  id:        BottomTabId
  label:     string
  icon?:     ReactNode
  component: React.ComponentType<{}>
  order:     number
  badge?:    (state: StoreState) => string | number | null
}
```

v1 built-ins:

| id | Order | Badge selector |
|---|---|---|
| `core.waveform` | 10 | — |
| `core.workspace` | 20 | — |
| `core.output` | 30 | — |
| `core.problems` | 40 | issue count; red when any error |

Rules:

- Same conflict-guard + deterministic ordering as activities.
- Badges read from store selectors; they do not poll.
- `core.problems` (tab) and `core.problems` (activity) share the
  same issues store slice — opening one focuses the other.

### 19.3 Extension hook (reserved, post-v1)

The registry modules will expose `registerActivity()` and
`registerBottomTab()` to loaded extensions in v2. v1 keeps both
registries as static maps and includes no plug-in loader. The
extension contract is therefore in the registry's TypeScript
types, not in any runtime API.

---

## 20. Accessibility

- All actions reachable by keyboard. (`Ctrl+.` action search is the
  fallback for anything without a chord.)
- Color must not be the only signal. The forbidden-drop cue
  combines red overlay + cursor change + textual reason in the
  status bar. Junction dots have a hatch fallback for high-contrast
  modes.
- Focus ring is visible on every focusable element.
- Modals trap focus and are escapable via `Esc`.

We do not target full WCAG AA conformance in v1 but every PR must not
introduce regressions to keyboard reachability or contrast on labels.

---

## 21. Test strategy

### 20.1 Unit tests (Vitest)

Per-module, no DOM:

- `model/`: schema validation, (de)serialize, round-trip.
- `store/`: every mutation; before/after snapshots; transactional
  batching; undo/redo replay.
- `canvas/router/`: orthogonal router determinism; pinned-bend
  reflow; junction creation.
- `canvas/transforms/`: rotation and mirror combinatorics; port
  position after each.
- `canvas/snapping/`: nearest-point selection across mixed targets.
- `library/`: search ranking; recency decay.
- `ipc/`: envelope encode/decode; binary frame parsing; stub kernel
  responses.

### 20.2 Component tests (Vitest + React Testing Library)

- Inspector renders correct editor per param type; commits on blur.
- Library palette filters and ranks; Enter inserts.
- Canvas mounts, renders nodes from store, dispatches store mutations
  on user gestures (use `userEvent.pointer` for drag).
- Diagnostics panel "Reveal" pans + selects.

### 20.3 End-to-end (Playwright)

The v1 smoke test (one scenario, mandatory before tagging v1):

1. Launch app, kernel = stub.
2. `Ctrl+.` twice → type "step" → Enter.
3. `Ctrl+.` twice → type "pid" → Enter.
4. `Ctrl+.` twice → type "scope" → Enter.
5. Drag wire: step.out → pid.in.
6. Drag wire: pid.out → scope.in.
7. Click PID; set `kp=1.0` in inspector.
8. `Ctrl+S` to a temp path.
9. Read file back; assert schema-valid.
10. `Ctrl+T`.
11. Wait for waveform; assert a uPlot canvas with >0 points.

A second e2e covers undo/redo: do all of the above, then `Ctrl+Z` ×N
and assert the canvas goes back to empty; `Ctrl+Y` ×N and assert it
returns to the loaded state.

### 20.4 Static checks in CI

- `pnpm typecheck` — strict TS.
- `pnpm biome ci` — formatting + lint.
- `pnpm vitest run` — unit + component tests, ≥80% statement coverage
  in `src/store/`, `src/model/`, `src/canvas/router/`,
  `src/canvas/transforms/`, `src/canvas/snapping/`.
- `pnpm playwright test` — e2e smoke + undo/redo scenarios.
- **Keymap drift check:** a script parses `keyboard-map.md` tables
  and `canvas/keymap.ts`; CI fails if any binding differs (chord,
  context, or action id).
- **File round-trip property test:** runs as part of vitest, but
  marked separately so it gets a higher minimum sample count.

### 20.5 Performance budgets

Asserted by Playwright performance traces:

- Canvas frame budget: 16 ms p95 for a 50-block model under
  drag-move.
- Library palette open: <50 ms from `Ctrl+.` press to focus.
- Save: <100 ms for a 200-block model.
- Load: <200 ms for a 200-block model.

A regression beyond budget fails CI.

---

## 22. Out of scope for v1

These have stub hooks but no implementation in v1. The architecture
docs reference them; we keep the seams visible so v2 doesn't need a
rewrite.

| Feature | Where the hook is | Spec source |
|---|---|---|
| Hierarchy (subsystems, breadcrumbs) | `canvas/Canvas.tsx` reserved hierarchy ctx; `model/` schema has a `subsystem` block type stub | architecture spec §10 #5 |
| Live backend port-type validation | `store/ipc.ts` has `validation_report` slot; UI cue paths in place | this doc §8.3 |
| FMI 3.0 import/export | menu items grayed out; `synthesis/` placeholder | architecture spec §10 #4 |
| Block synthesis (block → C, op-amp, etc.) | menu items grayed out; `synthesis/` placeholder | simulator_concept.md |
| LOD pyramid client (real HDF5) | `waveform/` LOD client interface defined, stub backend in v1 | architecture spec §7 |
| Pyodide free tier | IPC transport plug-in point; one bundle target later | architecture spec §9 Context B |
| Cloud kernel paid tier | identical IPC; only URL changes | architecture spec §9 Context C |
| Multi-tab editing | shell reserves tab strip; v1 ships single-tab | architecture spec §4 |
| Theme: dark mode | Tailwind class structure in place | this doc §18.2 |
| User keymap overrides UI | registry consumes JSON; UI to edit is v2 | this doc §12.5 |
| Action search across whole app | command palette UI in v1 lists canvas actions only | this doc §11 |
| Auto-arrange (Ctrl+Shift+A) | keymap entry; no-op handler in v1 | keyboard-map.md §8 |

---

*Living document. Update version + date on every structural change.
Last update: 2026-05-16.*
