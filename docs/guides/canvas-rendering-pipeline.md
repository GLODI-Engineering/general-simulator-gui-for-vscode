# From SVG file to canvas: how a component gets drawn, wired and dragged

This guide traces the full path a component takes — from its source files
(`metadata.yaml` + an SVG/JSX symbol) to a wired-up block on the canvas — and
explains the four subsystems that make that possible: symbol rendering, the
port system, the library panel, and wire management. It assumes you've already
read [drawing-component-symbols.md](./drawing-component-symbols.md) for the
"how do I author a symbol" angle; this document is the "how does the rest of
the app use what I authored" angle.

---

## 1. From files on disk to a rendered symbol

### 1.1 The two source files per block

Every block has (at minimum):

| File | Role |
|---|---|
| `packages/blocks/.../<block>/metadata.yaml` | Canonical description: ports (`side`/`offset`), params, `symbol.bbox`, fidelity tiers |
| A render in `component-symbols.tsx` (JSX primitives) **or** an imported `.drawio.svg` | The visual artwork |

These are independent — see the table in
[drawing-component-symbols.md](./drawing-component-symbols.md#how-the-system-renders-symbols).
`metadata.yaml` controls *where wires attach*; the symbol controls *what gets
drawn*. Mismatches between the two are the most common "I changed X but
nothing moved" surprise (see §2).

### 1.2 Build-time: metadata.yaml → catalog-manifest.json

`apps/frontend/scripts/build-catalog-manifest.ts` walks every
`packages/blocks/src/blocks/**/metadata.yaml`, validates it against the
block-metadata JSON schema, and writes a single aggregated
`apps/frontend/src/library/catalog-manifest.json`. The frontend never reads
the YAML files directly — it reads this generated manifest.

### 1.3 App startup: manifest → catalog → store

- `library/catalog.ts` → `loadCatalogFromManifest()` imports the static JSON
  and hands it to `catalog-core.ts` → `loadCatalog()` (catalog-core.ts:249-274).
- `loadCatalog()` runs each entry through `normalizeMetadata()`
  (catalog-core.ts:93-154), which fills in `paradigm`/`domain`/`fidelities`
  for older-style metadata that doesn't declare them explicitly, validates
  with Ajv, and builds lookup keys via `catalogKeys()` (catalog-core.ts:59-70)
  — this is also where `physical-electrical.<name>` aliases get added.
- `App.tsx` calls `setCatalog(loadCatalogFromManifest())` once on mount and
  stores the result (`Record<string, BlockMetadata>`) in the Zustand
  `library` store.

### 1.4 Render time: BlockSymbol assembles the picture

`canvas/nodes/BlockSymbol.tsx` is the component that actually draws a block.
For each block instance it:

1. Reads `metadata.symbol.bbox` (`[width, height]`) — the symbol's authored
   coordinate system.
2. Looks up a **schematic symbol** via `getSchematicSymbol(metadata.name, ...)`
   from the `SCHEMATIC_SYMBOLS` registry in `component-symbols.tsx`. Each
   registry entry is a `SchematicSymbol`:
   ```ts
   interface SchematicSymbol {
     render: (ctx: SymbolContext) => ReactNode;
     valueParam?: string;
     unit?: string;
     staticLabel?: string;
     selfDrawnPorts?: boolean;   // see §2.4
   }
   ```
3. Wraps the rendered output in:
   ```jsx
   <svg width={scaledWidth} height={scaledHeight} viewBox="0 0 scaledWidth scaledHeight">
     <g transform={`scale(${SYMBOL_SCALE}) ${symbolTransform(rotation, mirror, bbox)}`}>
       {schematic.render(...)}
     </g>
     {/* Port overlays drawn here, in unscaled screen-space, see §2 */}
   </svg>
   ```
   `SYMBOL_SCALE = 1.6` (defined in `port-hit-test.ts`) is the **uniform
   on-canvas magnification** applied to every symbol so small authored bboxes
   (commonly 60×40) read clearly. `symbolTransform()` (BlockSymbol.tsx:76-101)
   builds the rotation/mirror transform so it composes with `getPortCenter()`
   (§2.2) exactly — this is what keeps the visible artwork, the invisible
   port handles, and attached wires aligned through rotation/mirroring.
4. If there's no registered schematic, it falls back to either a custom SVG
   `path` (`metadata.symbol.shape: "custom"`) or to **primitive shapes**
   derived straight from the metadata via `metadataToPrimitives()`
   (`primitive-renderer.ts`) — rectangles, circles, polygons, text, drawn by
   `PrimitiveShape` (BlockSymbol.tsx:11-55).

### 1.5 Two ways to author the artwork itself

`SCHEMATIC_SYMBOLS` entries draw their artwork one of two ways:

- **Hand-coded JSX** — functions like `jfetSymbol`/`mosfetSymbol` draw raw
  `<line>`/`<path>`/`<polygon>` primitives in the symbol's local coordinate
  space (0..bbox). Full control, fully themeable (`color={STROKE}`), but
  labor-intensive for complex hand-drawn artwork.
- **Imported draw.io SVG** — e.g. `pmosfetRenderPE()` returns
  `<PmosSvg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" color={STROKE} />`,
  where `PmosSvg` is a `.drawio.svg` file imported via `vite-plugin-svgr`
  (`?react` suffix on the import). Faster to produce visually-rich artwork
  (drawn once in draw.io, exported, registered), at the cost of the artwork's
  geometry living in a file separate from `metadata.yaml`'s port `offset`
  values — see the alignment caveat in §2.4 and the
  [/import-symbol skill](../agent-rules/skills/import-symbol/SKILL.md) for the
  full import workflow (extract geometry, compute the coordinate transform,
  register the symbol, etc).

---

## 2. The port system

A port is two **independent** things layered on top of each other, and
understanding that separation is the key to not getting confused (this is
exactly the confusion this guide grew out of — see the worked example at the
end of this section).

### 2.1 Layer 0 — the metadata: where a wire attaches

`metadata.yaml` declares each port's `side` (`left`/`right`/`top`/`bottom`)
and `offset` (a coordinate along that side, in the symbol's *unscaled* bbox
units):

```yaml
ports:
  inputs:
    - id: g
      label: G
      side: left
      offset: 350
  outputs:
    - id: d
      side: top
      offset: 38
```

This is the **only** thing `offset` controls. It does not move, resize, or
otherwise affect the drawn artwork from §1.5 — those are unrelated systems
that happen to be drawn at roughly the same place.

### 2.2 Computing the actual on-screen point

`canvas/nodes/port-hit-test.ts`:

- `basePortCenter(port, bbox)` (lines 29-40) maps `side`+`offset` to a point
  in unscaled bbox space: `left → (0, offset)`, `right → (bbox.w, offset)`,
  `top → (offset, 0)`, `bottom → (offset, bbox.h)`.
- `getPortCenter(block, port, bbox)` (lines 73-84) then applies, in order,
  **mirror** (`applyMirror`, lines 42-54), **rotation**
  (`applyRotation`, lines 56-71), `× SYMBOL_SCALE`, and finally the block's
  model `position` — producing the final on-canvas pixel coordinate.
- `getMetadataPortCenters(block, metadata)` (lines 101-110) does this for
  every port on a block and is the single function every consumer calls:
  `BlockNode`, `BlockSymbol`, `Canvas`, `topology.ts`, `buck-schematic.ts`,
  `store/graph.ts` — **one source of truth** for "where is this port".

### 2.3 Layer 1 — the invisible Handle (interaction substrate)

`canvas/nodes/BlockNode.tsx:37-55` turns each `getMetadataPortCenters()`
result into a React Flow `<Handle>`:

```jsx
<Handle
  id={port.id}
  type={inputs.has(port.id) ? "target" : "source"}
  position={side}
  style={{ left: relX, top: relY, width: 1, height: 1, border: 0, opacity: 0 }}
/>
```

It's **invisible** (`opacity: 0`, 1×1px) — purely the React Flow wire-anchor
and a fallback hit target. The position is in *flow coordinates*, identical
to the model port centre, which is what keeps wire endpoints aligned with
routing waypoints (see §4).

### 2.4 Layer 2 — the `Port` overlay (visuals + click target)

`BlockSymbol.tsx:244-263` additionally renders a `<Port>` component
(`canvas/nodes/Port.tsx`) at every port centre, in **unscaled SVG space**
(outside the `scale(SYMBOL_SCALE)` group, so its geometry — stub length,
dot radius — stays a constant screen size regardless of zoom). For each port
it draws, by default (`decorate = true`):

- a **stub line** extending outward from the component boundary
  (`STUB_LEN = 16`),
- a **filled terminal dot** at the stub tip (`TERMINAL_R = 3.5`) — the
  wire-attachment point,
- a **small origin dot** (`r = 2`) marking the boundary contact point,
- a **text label** taken from `metadata.ports[].label`,
- and, wrapping all of it, `<g data-port-id={id} ...>` — this `data-port-id`
  attribute is what `Canvas.tsx` looks for via
  `event.target.closest("[data-port-id]")` (Canvas.tsx:439, 690) when
  detecting wire-draw start/end. **This is why you can't simply delete
  `<Port>`'s output** — it's not purely decorative, it's the click target.

#### The `selfDrawnPorts` escape hatch

Imported SVG artwork (§1.5) often *already contains* its own terminal dots
and letter labels, baked in by the original artist. Rendered on top of
`<Port>`'s own stub/dot/label, you get visible duplicates. The fix —
implemented for `physical_electrical.semiconductor.mosfet_p` — is **not** to
edit the artwork, but to flag the schematic entry:

```ts
"physical_electrical.semiconductor.mosfet_p": {
  staticLabel: "PMOS",
  render: () => pmosfetRenderPE(),
  selfDrawnPorts: true,
},
```

`BlockSymbol.tsx` then passes `decorate={!schematic?.selfDrawnPorts}` to
`<Port>`. With `decorate = false`, `Port.tsx` still renders the
`data-port-id` wrapper and an invisible hit-area (stub + dot drawn with
`stroke`/`fill="transparent"` and explicit `pointerEvents`), but skips the
origin dot and text label — so wiring still works, but nothing is drawn
twice. Any future imported symbol with complete terminal art can opt in the
same way.

### 2.5 Worked example: "I moved the gate's `offset` and nothing changed"

This is the scenario that prompted this whole investigation, and it's a good
test of whether the model above makes sense:

1. Changing `offset: 350` on the `g` port moves the **invisible Handle**
   (§2.3) and the **`Port` overlay's stub/dot/label** (§2.4) — i.e. the
   wire-attachment point and (if `decorate` is on) its visible marker.
2. It does **not** move the gate line drawn inside `pmos.drawio.svg` — that
   geometry is baked into the SVG file's own coordinate space, completely
   independent of `metadata.yaml`.
3. So the visible symptom — "nothing visibly moved" — is actually correct:
   the *artwork* didn't move, only the (until recently, invisible-by-default
   in this case after the `selfDrawnPorts` fix) overlay did. To move the
   *visible* gate terminal you edit the SVG; to keep the wire-anchor aligned
   with it, you then update `offset` to match the new terminal position
   (converted into bbox coordinates).

---

## 3. The library/component panel

### 3.1 Data: from manifest to the sidebar list

`library/LibraryActivity.tsx` reads the catalog from the Zustand `library`
store (`Object.values(state.catalog)`), optionally filters by the selected
simulator (only blocks whose `simulators.supported` set includes the active
one), then runs `dedupeAndCollapse()` (lines 125-170):

- duplicate entries (same `name`, multiple catalog keys) collapse to one,
- families of near-identical variants (DC/AC/pulse resistor, voltage vs.
  current source, etc., matched by `familyKey()`, lines 44-67) collapse into
  a single representative entry labeled e.g. *"Resistor (double-click to
  choose variant)"*.

The result is grouped into the eleven categories defined by
`CATEGORY_ORDER`/`CATEGORY_LABELS` (lines 9-35), each rendered as a
collapsible section (expansion state lives in the `ui` store's
`libraryTreeExpanded`). A nested `SignalFlowSection()` (lines 334-431)
further splits "Signal" blocks into routing vs. signal-attribute sub-groups.

### 3.2 The draggable item

Each row is a `SidebarItem` (`library/SidebarItem.tsx`). On `dragstart`
(lines 12-25) it:

- records the block's `name` in a **module-level variable**
  (`setActiveDragBlock`, see §4.1 — a deliberate workaround, not an oversight),
- sets `dataTransfer` MIME types `application/x-gensim-block` (the
  `DND_BLOCK_TYPE` constant) and `text/plain` as a JSON-encoded payload,
- and sets a custom drag-image element so the cursor shows the block's label
  while dragging.

---

## 4. Drag-and-drop: from sidebar row to graph block

### 4.1 Why there's a module-level variable

`canvas/dnd.ts` defines `setActiveDragBlock`/`getActiveDragBlock` backed by a
plain module variable `_activeDragBlock`, alongside the standard
`dataTransfer`-based encode/decode helpers (`encodeBlockPayload`/
`decodeBlockPayload`). The comment in the source explains why both exist:
HTML5 `dataTransfer` reads are unreliable in Tauri's Linux WebKitGTK webview,
so the module variable is the **canonical** source of truth for "what's being
dragged right now", with `dataTransfer` kept as a defensive fallback/for
browser-standard compliance.

### 4.2 The drop

`Canvas.tsx:1031-1054` → `handleDrop()`:

1. `event.preventDefault()`,
2. reads the canvas's bounding rect plus the current pan/zoom/grid from the
   stores,
3. resolves the dragged block's name via `getActiveDragBlock()` — the
   module-level value set in §4.1,
4. converts the screen drop coordinates to model coordinates with
   `screenToModelCoords()` (accounting for pan/zoom and snapping to the grid
   via `snapToGrid()`, both in `dnd.ts:37-52`),
5. calls `insertAtPosition(metadata, [x, y])`.

### 4.3 Turning metadata into a `Block` instance

`library/insert.ts` → `createBlockFromMetadata()` (lines 83-106) builds the
new instance:

| Field | How it's derived |
|---|---|
| `id` | sanitized block name + random suffix |
| `type` | `metadata.name` |
| `paradigm` | inferred from the name prefix — signal-flow vs. physical-network (`inferParadigm`, lines 24-32) |
| `domain` | inferred from the first port or `behavior.domain` (`inferDomain`, lines 34-42) |
| `fidelity` | `"ideal"` for physical-network blocks, `"n_a"` for signal-flow |
| `params` | deep-cloned from `metadata` defaults |
| `rotation` / `mirror` | `0` / `"none"` |
| `label` | next free SPICE-style reference designator — R1, C2, Q5… (`assignRefdes`, lines 69-81) |
| `position` | the drop point, or `nextInsertPosition()` (lines 12-22) for click-to-insert, which lays out new blocks in a grid relative to the current view |

`insertAtPosition()` (lines 116-121) wraps all of this in a graph-store
transaction and calls `graph.addBlock()` (`store/graph.ts:309-316`), which
snapshots state for undo, validates the position lies on the integer grid,
and pushes the new block into `document.model.blocks`.

(Clicking a library row instead of dragging goes through the sibling
function `insertCatalogBlock()`, lines 108-114, using the default
grid-layout position.)

---

## 5. Wires: drawing, routing, and staying attached

### 5.1 Starting and finishing a wire

Wire drawing is driven from `Canvas.tsx`. A pointer-down on a port (detected
via `closest("[data-port-id]")`, see §2.4) starts a draw, tracked in
`wireDrawRef`; further pointer moves append waypoints; releasing on another
port's `[data-port-id]`/`[data-block-id]` element commits the wire via
`commitWireToPort()` (Canvas.tsx:211-281), which:

1. resolves the destination port (`resolvePortFromStore`),
2. enforces signal-flow invariants — a target can't already be driven, the
   direction must run output→input (swapping the endpoints if necessary),
3. checks domain/kind compatibility with `canConnect()` and rejects
   duplicates,
4. **routes** the path with `routeWithAnchors()`,
5. and stores the result as a `Wire` — `from`/`to` endpoints plus *interior*
   waypoints (the port-anchored start/end points are derived live from
   `getMetadataPortCenters`, not stored).

### 5.2 Orthogonal auto-routing with obstacle avoidance

`canvas/router/ortho-route.ts` implements Manhattan-style routing on a
`GRID = 20` unit grid:

- `routeOrtho()` (lines 181-263) first tries a direct path if start/end are
  already aligned, then tries the two possible single-bend "L" routes
  (horizontal-first / vertical-first, informed by a `prevDir` hint so chained
  segments keep a consistent feel), checking each against obstacles via
  `routeBlocked()`.
- If both L-routes are blocked, `detour()` (lines 144-172) tries offset
  "rails" at `GRID × {3, 5, 7}` to route around the obstruction.
- Obstacles come from `router/obstacles.ts`: `compBBox()` computes a padded
  (4-unit), rotation-aware bounding box per block, and `getObstacles()`
  excludes the wire's own source/target blocks so it can exit them freely.
  `segCrossesBox()` tolerates flush routing (≤1px overlap on a boundary).

`routeWithAnchors()` (Canvas.tsx:159-190) drives this segment-by-segment
across the user's explicit waypoints plus the final target.

### 5.3 Rendering

`canvas/edges/WireEdge.tsx` renders each wire as an SVG path:

- `buildWirePoints()` assembles `[source, ...waypoints, target]` and rounds
  to integers; `isOrthogonalPolyline()` checks every segment is purely
  horizontal or vertical.
- Orthogonal polylines render via `wireSvgPath()` (a plain `M x y L x y …`
  string); a wireless-of-waypoints non-orthogonal edge gets an automatic
  single-bend path from `autoOrthogonalPath()` (covers React-Flow handle
  drift); anything else non-orthogonal is shown in a dashed "invalid" style.
- A wide (12px) transparent "hit area" path sits under the visible (colored
  by domain, ~2.1×`SYMBOL_SCALE`px) stroke for easier grabbing.
- Interior segments expose drag handles; pinned waypoints render as dots.

### 5.4 Junctions

`canvas/edges/junctions.ts` → `computeJunctions()` is a pure function that
tallies every waypoint coordinate across all wires and returns the points
where **three or more** wires meet. `WireEdge.tsx`'s `JunctionDots()`
(lines 146-170) renders these as filled 4px circles (`#334155`).

### 5.5 Keeping wires attached when blocks move

Two complementary mechanisms:

- **Live drag** — `router/attachment.ts`: `snapshotPortWires()` captures the
  endpoint state of all wires touching the blocks about to move;
  `stretchAttachedWires()` then translates each affected endpoint by the
  block's movement delta and calls `rerouteEndSegment()` to re-orthogonalize
  just the end segment (rewriting its interior vertex), falling back to a
  full `routeOrtho()` re-route of that subsection if the straightened segment
  would now cross an obstacle.
- **On load / bulk moves** — `store/graph.ts` → `rerouteWiresForBlocks()`
  (lines 129-189) re-normalizes the wires touching a given set of blocks,
  while leaving untouched or explicitly pinned wires alone (so it doesn't
  snap dangling/intentional endpoints back to the origin).

### 5.6 Manual segment dragging

`canvas/edges/segment-drag.ts` → `applySegDrag()` moves a dragged interior
segment (and its adjacent vertices) along the perpendicular axis, then
re-orthogonalizes (`ensureOrtho`) and drops now-collinear vertices
(`simplifyPts`) to keep the polyline minimal.

---

## 6. Quick reference — "I want to change X, where do I look?"

| You want to… | Look at |
|---|---|
| Change where a wire attaches to a component | `metadata.yaml` → `ports[].side`/`offset` |
| Change what a component looks like (hand-drawn) | `component-symbols.tsx` — the `render` function in its `SCHEMATIC_SYMBOLS` entry |
| Change what a component looks like (imported SVG) | The `.drawio.svg` file under `canvas/nodes/symbols/`, then re-sync `offset` values — see [importing-symbols-from-drawio.md](./importing-symbols-from-drawio.md) |
| Stop a symbol's own dots/labels doubling up with the generic port markers | Set `selfDrawnPorts: true` on its `SCHEMATIC_SYMBOLS` entry (§2.4) |
| Add/remove a block from the library panel | Add/remove its `metadata.yaml` (the manifest is regenerated at build time) |
| Change how blocks group/label in the sidebar | `LibraryActivity.tsx` — `CATEGORY_ORDER`/`CATEGORY_LABELS`, `familyKey()`, `dedupeAndCollapse()` |
| Change the default position/refdes of a newly-dropped block | `library/insert.ts` — `createBlockFromMetadata`, `nextInsertPosition`, `assignRefdes` |
| Change wire routing behaviour (bends, obstacle avoidance) | `canvas/router/ortho-route.ts`, `obstacles.ts` |
| Change wire visual style / hit area / junction dots | `canvas/edges/WireEdge.tsx`, `wire-path.ts`, `junctions.ts` |
| Change what happens when a wired block is dragged | `canvas/router/attachment.ts`, `store/graph.ts` → `rerouteWiresForBlocks` |
