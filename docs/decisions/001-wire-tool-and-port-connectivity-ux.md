# Decision 001 — Wire tool and port-connectivity UX

Date: 2026-05-29
Status: Proposed
Scope: `apps/frontend/src/canvas`, `apps/frontend/src/shell`, `apps/frontend/src/store`, frontend progress planning

## Context

We reviewed the clean-room OSS analysis material under `Misc/oss-analysis/` for Qucs, KiCad, Xcos, Simulink, and Simscape, focusing on how each tool manages ports, lines/wires, wire drawing, toolbar affordances, and connection validation.

The key product tension is that `general-simulator` must support two user mental models:

1. **Simulink-like block diagrams** — users expect direct port-to-port drag and Quick Insert.
2. **Qucs/KiCad-like electrical schematics** — users expect an explicit Wire/Draw Wires toolbar tool.

The frontend spec remains Simulink-aligned, but schematic/electronics users need a discoverable wire tool.

## Findings from OSS tools

### Qucs

- Has an explicit **Wire** toolbar button.
- `Wire` is a checkable toolbar action with shortcut `Ctrl+E`.
- Clicking it enters a modal wire tool.
- User clicks a start point, moves with an orthogonal L-shaped ghost preview, and clicks an endpoint to commit one or two wire segments.
- Right-click toggles the first-leg posture.
- Connectivity is mostly geometry-first: ports/wire endpoints sharing coordinates become connected; landing on a wire body splits it.
- Strength: simple, visible, schematic-friendly wire workflow.
- Weakness: limited semantic/type validation and local-stretch behavior after moves.

### KiCad

- Has an explicit **Draw Wires** toolbar action.
- Default hotkey is `W`; action is a toolbar toggle.
- Draw tool supports snapped preview, segment posture switching, undo-last-segment, finish-on-terminal, and junction preview.
- Connectivity is built into a deterministic connection graph used by ERC.
- Strength: excellent explicit wire tool and deterministic graph semantics.
- Weakness: KiCad-specific net-driver heuristics are not a substitute for our typed port compatibility.

### Xcos

- Main toolbar does not expose a clear primary Link/Wire button in the inspected `XcosTab.createToolBar(...)` path.
- Link creation is graph/port driven: start from a port, click diagram to add link points, finish on compatible target.
- Port compatibility uses port/link families: explicit, implicit, command/control.
- Link styles are menu actions: horizontal, straight, vertical, optimal.
- Strength: typed port/link families and compatibility checks.
- Weakness: tree-first insertion and known route persistence/readability issues.

### Simulink

- No primary line-button workflow.
- Primary gesture is direct drag from output/input port to compatible target port.
- Dragging from an existing line creates a branch point.
- Signal compatibility is checked structurally during draw/update; dimensions, data type, and sample time are resolved by propagation/update passes.
- Strength: direct port-drag is fast, discoverable once learned, and strongly tied to typed ports.
- Weakness: some checks happen at update/simulation time; silent reset of user-fixed routes is an anti-pattern.

### Simscape

- Reuses Simulink canvas conventions but adds strongly distinct physical port kinds.
- Physical conserving ports are visually distinct from signal ports.
- Cross-domain connections require converter blocks.
- Strength: port kind is visible before connection; domain mismatch is rejected early.

## Decision

`general-simulator` should support **both** connection workflows:

1. **Primary workflow: direct port-to-port drag.**
   - Always available in Select mode.
   - Matches Simulink and the current frontend spec.

2. **Secondary/discoverability workflow: explicit Wire tool/button.**
   - Visible in the canvas toolbar.
   - Important for electrical schematic users coming from Qucs/KiCad.
   - Does not replace port drag.

We should **not** bind `W` by default because `docs/specs/keyboard-map.md` intentionally leaves single-letter wire mode unbound under the Simulink-aligned policy. A toolbar button and command-palette action are acceptable.

## Required behavior

### Wire tool mode

When the Wire tool is active:

1. Cursor becomes crosshair.
2. First click on a compatible port starts the wire.
3. Moving cursor shows an orthogonal preview.
4. Clicking empty canvas adds an explicit waypoint/bend.
5. Clicking a compatible target port commits the wire.
6. Clicking a wire body creates a branch/junction, then continues or commits depending on context.
7. `Esc` cancels the in-progress wire; if no wire is active, it returns to Select mode.
8. `/` toggles horizontal-first vs vertical-first posture.
9. Dropping/clicking an incompatible port shows a forbidden cue and does not commit.

### Direct port drag

Direct drag must remain available even when Select mode is active:

1. Pointer down on any port starts a wire preview.
2. Hover over compatible target port highlights valid snap.
3. Hover over incompatible target port shows forbidden cue and reason.
4. Release on compatible port commits.
5. Release on empty canvas cancels.
6. Release on wire body creates a branch/junction.

### Port visuals

Port markers must expose kind/domain before the user draws a wire:

| Port kind | Required cue |
|---|---|
| Signal | blue round marker |
| Physical electrical | red square or otherwise clearly distinct marker |
| Physical thermal | orange distinct marker |
| Physical mechanical | grey/green distinct marker |
| Function/event | green distinct marker |

Color must not be the only cue; shape and accessible title/label should carry domain information.

### Connectivity and topology

- Semantic compatibility and geometric topology must be separate concepts.
- Wire crossings are not connections unless a junction exists.
- Landing on a wire body creates a junction/branch.
- Fan-out from one signal output to many inputs is allowed.
- Fan-in to one signal input is rejected unless using an explicit merge/sum/special block.
- Physical/acausal networks can have multiple components sharing a node if port kinds match.

### Wire routing

- Default wires are orthogonal.
- Preview is deterministic and integer-snapped.
- Stored waypoints are integer pairs.
- Unpinned wires reroute deterministically after block moves/rotates.
- Pinned bends remain stable.
- Junction dots are rendered from topology, not manually stored.

## Non-goals

- No default `W` hotkey.
- No full obstacle-avoiding router in the first implementation pass.
- No implicit insertion of converter/rate-transition/merge blocks.
- No hidden auto-fix for incompatible domains.

## Implementation epics

### FE-84 — Canvas wire tool mode and toolbar affordance

Area: canvas

Summary: Add a visible Wire button to the canvas toolbar and a UI-store tool mode for Select/Wire/Annotate/Pan, while preserving direct port-drag behavior in Select mode.

Implementation paths:

- `apps/frontend/src/store/ui.ts`
- `apps/frontend/src/canvas/Canvas.tsx`
- `apps/frontend/src/canvas/CanvasOverlay.tsx`
- `apps/frontend/src/shell/EditorArea.tsx` or current canvas toolbar host
- `apps/frontend/src/canvas/keymap.ts`

Acceptance:

- Canvas toolbar exposes a Wire button that toggles wire mode.
- Wire mode changes cursor and state without blocking direct store updates.
- Select mode still allows direct port-to-port drag.
- `Esc` cancels active wire drawing and returns to Select mode when appropriate.
- Command palette exposes the Wire tool action without adding a default `W` binding.

Tests:

- Toolbar button toggles wire mode.
- Direct port drag still works in Select mode.
- `Esc` cancels in-progress wire and resets tool state.
- Keymap has no default `W` binding.

### FE-85 — Multi-click wire bends and posture toggle

Area: canvas

Summary: Extend wire drawing from simple drag preview to explicit multi-click routing in Wire mode, including canvas-waypoint insertion and `/` posture toggle.

Implementation paths:

- `apps/frontend/src/canvas/Canvas.tsx`
- `apps/frontend/src/canvas/wire-draw.ts`
- `apps/frontend/src/canvas/router/interactive-draw.ts`
- `apps/frontend/src/canvas/router/preview-layer.tsx`
- `apps/frontend/src/canvas/keymap.ts`

Acceptance:

- In Wire mode, clicking a start port begins a route.
- Clicking empty canvas adds integer-snapped waypoint(s).
- Clicking compatible target port commits route with all explicit bends.
- `/` toggles horizontal-first/vertical-first posture during preview.
- Dropping/clicking invalid target cancels or refuses commit with feedback.

Tests:

- Multi-click route stores expected integer waypoints.
- Posture toggle changes preview bend order.
- Invalid target does not add a wire.

### FE-86 — Wire body branch/junction creation

Area: canvas

Summary: Support starting or finishing a connection on an existing wire body by splitting the wire topology and rendering explicit junction dots. This depends on owning wire rendering and deriving topology; React Flow smoothstep edges are not sufficient.

Implementation paths:

- `apps/frontend/src/canvas/Canvas.tsx`
- `apps/frontend/src/canvas/topology.ts`
- `apps/frontend/src/canvas/edges/WireEdge.tsx`
- `apps/frontend/src/canvas/router/interactive-draw.ts`
- `apps/frontend/src/canvas/derive-flow-state.ts`
- `apps/frontend/src/store/graph.ts`
- `packages/schemas/definitions/model/gsim_sch.schema.json` only if topology schema needs extension

Acceptance:

- Hit-testing a rendered wire body can create a branch point.
- Branch creation preserves existing wire endpoints and labels/metadata where present.
- Junction dots render only where topology indicates an actual junction.
- Plain crossing wires without junction remain unconnected.

Tests:

- Drop on wire body splits target route and adds branch topology.
- Crossing without explicit junction is not treated as connected.
- Junction renderer shows dots at branch points only.

### FE-87 — Domain-specific port marker shapes and accessibility labels

Area: canvas

Summary: Make port kind visible before wiring by using shape plus color, and expose accessible labels/titles for port domain/direction.

Implementation paths:

- `apps/frontend/src/canvas/nodes/Port.tsx`
- `apps/frontend/src/canvas/nodes/BlockSymbol.tsx`
- `apps/frontend/src/canvas/port-compat.ts`
- `apps/frontend/src/shell/layout.css`

Acceptance:

- Signal ports use round markers.
- Physical conserving ports use a distinct non-round marker.
- Domain is available in accessible label/title.
- Compatibility hover feedback does not rely on color only.

Tests:

- Port component renders distinct shapes for signal vs physical-electrical.
- Accessible label includes domain and direction.
- Compatibility tests still reject cross-domain wires.

### FE-90 — Custom waypoint-aware wire edge renderer

Area: canvas

Summary: Replace React Flow `smoothstep` wire rendering with a custom SVG/polyline edge renderer that uses canonical wire endpoints and `wire.waypoints`. This is the rendering prerequisite for pinned bends, junction dots, exact save/load fidelity, and Qucs/KiCad-style schematic lines.

Implementation paths:

- `apps/frontend/src/canvas/derive-flow-state.ts`
- `apps/frontend/src/canvas/Canvas.tsx`
- `apps/frontend/src/canvas/edges/WireEdge.tsx`
- `apps/frontend/src/canvas/edges/wire-path.ts`
- `apps/frontend/src/canvas/nodes/BlockNode.tsx`
- `apps/frontend/src/shell/layout.css`

Acceptance:

- Canvas registers a custom `wire` edge type instead of rendering wires as React Flow `smoothstep`.
- Wire rendering uses source port center, stored integer waypoints, and target port center to draw an orthogonal SVG polyline.
- Non-orthogonal waypoint lists are visibly flagged or refused by the renderer/test helper.
- Pinned wires show a distinct marker/label without depending on React Flow's edge label behavior.
- Existing direct port-drag wire commits continue to produce visible connected lines.

Tests:

- WireEdge renders a polyline containing source, waypoint, and target coordinates in order.
- Non-orthogonal waypoint input is detected.
- `deriveFlowEdges()` emits type `wire` with wire data intact.
- Existing Canvas wire tests still pass with the custom edge type.

### FE-88 — Deterministic topology graph for frontend connectivity

Area: canvas

Summary: Add a frontend connectivity/topology derivation pass used by canvas rendering, junction display, validation, and future IR export.

Implementation paths:

- `apps/frontend/src/canvas/topology.ts`
- `apps/frontend/src/canvas/derive-flow-state.ts`
- `apps/frontend/src/problems/problems-store.ts`
- `apps/frontend/src/store/graph.ts`

Acceptance:

- Topology derivation groups connected ports/wires by coordinate and explicit junctions.
- Result is deterministic for the same model.
- It distinguishes geometric crossing from connected junction.
- It provides enough data for fan-in/fan-out checks.

Tests:

- Same model produces byte-equivalent topology summary.
- Crossing wires produce separate nets.
- Junction-connected wires produce one net.
- Fan-in to a signal input is reported as an issue.

### FE-89 — Post-move deterministic wire reroute and pinned bends hardening

Area: canvas

Summary: Ensure moved/rotated blocks trigger deterministic rerouting of connected unpinned wires while preserving pinned bends and explicit user waypoints.

Implementation paths:

- `apps/frontend/src/store/graph.ts`
- `apps/frontend/src/canvas/router/cleanup.ts`
- `apps/frontend/src/canvas/router/pinning.ts`
- `apps/frontend/src/canvas/transforms/rotate.ts`
- `apps/frontend/src/canvas/transforms/mirror.ts`

Acceptance:

- Moving a block reroutes connected unpinned wires from current port centers.
- Pinned bends remain at their snapped canvas coordinates.
- Rotating/mirroring a block recomputes port anchors and reroutes connected wires.
- Reroute output is deterministic and integer-only.

Tests:

- Move block reroutes unpinned wire deterministically.
- Pinned bend survives move/rotate.
- Repeated move/undo/redo does not introduce coordinate drift.

### FE-91 — Schematic symbol coverage, lookup normalization, and rotated bounds

Area: canvas

Summary: Harden component rendering so schematic symbols remain accurate as catalog names/types evolve and as non-square symbols rotate. The current SVG foundation is good, but symbol lookup is tied only to `metadata.name`, many electrical parts fall back to generic rectangles, and rotated node bounds can be wrong for non-square components.

Implementation paths:

- `apps/frontend/src/canvas/nodes/component-symbols.tsx`
- `apps/frontend/src/canvas/nodes/BlockSymbol.tsx`
- `apps/frontend/src/canvas/nodes/BlockNode.tsx`
- `apps/frontend/src/canvas/derive-flow-state.ts`
- `apps/frontend/src/library/catalog-core.ts` only if alias metadata needs a helper
- `apps/frontend/src/canvas/nodes/BlockSymbol.test.tsx`

Acceptance:

- `getSchematicSymbol()` can resolve by metadata name, metadata type, and known alias forms such as `physical-electrical.*` and `physical_electrical.*`.
- Symbol renderers scale or validate against `metadata.symbol.bbox` instead of silently assuming 60-unit width.
- High-value electrical symbols missing from the current registry are either added or explicitly tracked in a coverage map.
- React Flow node dimensions account for 90/270-degree rotation of non-square symbols so selection and edge handles do not clip.
- Generic fallback remains acceptable for signal-flow blocks and clearly distinguishable from electrical schematic symbols.

Tests:

- Hyphenated and underscored physical-electrical aliases resolve to the same schematic symbol.
- Non-square rotated symbol reports swapped node dimensions/handle extents.
- Coverage test identifies unimplemented electrical schematic symbols without silently falling back.
- Existing BlockSymbol tests pass for fallback signal-flow blocks.

## Proposed implementation order

1. FE-87 — Port marker shapes and accessibility labels.
2. FE-90 — Custom waypoint-aware wire edge renderer.
3. FE-84 — Wire tool mode and toolbar affordance.
4. FE-85 — Multi-click bends and posture toggle.
5. FE-88 — Deterministic topology graph.
6. FE-86 — Wire body branch/junction creation.
7. FE-89 — Post-move deterministic reroute hardening.
8. FE-91 — Schematic symbol coverage, lookup normalization, and rotated bounds.

This order first fixes the misleading/weak visible affordances, then gives the canvas an owned wire renderer, then layers richer wire interaction and topology correctness on top. Symbol-coverage hardening can run in parallel after FE-87, but it is not required before the wire renderer work.
