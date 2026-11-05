# Changelog

## 2026-05-31 — Canvas algorithm adoption (phase P21)

### Frontend

- **Adopted the reference editor's superior canvas algorithms (path A).** The
  standalone `schematic_editor.html` reference editor was decommissioned and its
  strong interactive geometry ported into the production React/ReactFlow canvas
  as pure, DOM-free modules: an **orthogonal auto-router with obstacle
  avoidance** (`canvas/router/ortho-route.ts`, `obstacles.ts` — FE-98); **wire
  attachment + live stretch + end-segment reroute** on block move
  (`canvas/router/attachment.ts` — FE-99); **junction-dot computation/render**
  (`canvas/edges/junctions.ts` — FE-100); **wire segment dragging** with
  orthogonal re-normalisation (`canvas/edges/segment-drag.ts` — FE-101);
  **domain-driven wire colours + connection-reject flash** mapped onto the
  existing `PortKindDomain` (`canvas/edges/wire-color.ts`, `port-compat.ts` —
  FE-102); a **catalog-driven primitive symbol renderer** (canvas + identical
  SVG) with no hardcoded component table (`canvas/nodes/primitive-renderer.ts` —
  FE-103); and **V/I probes persisted in `.gsim_sch`** under `model.metadata.probes`
  (`canvas/probes.ts` — FE-105).
- **Keymap parity guard (FE-106).** The reference editor's inline keydown handler
  was discarded; all ported actions dispatch through `canvas/keymap.ts` via the
  single `KeymapProvider`. `assertNoBareLetterRotate` forbids reintroducing the
  bare-`R` rotate; rotation stays `Ctrl+R` / `Ctrl+Shift+R` per the keyboard map.
- **Deferred symbol editor (FE-104).** The in-canvas symbol editor is specified
  in `docs/specs/symbol-editor-spec.md` (Form/Draw, FE-103 primitives,
  block-metadata output, smooth-model gating) and deferred for later implementation.
- **Removed `schematic_editor.html`** (FE-107). Decisions D1–D5 are recorded in
  `docs/specs/canvas-algorithm-adoption.md`.

---

## 2026-05-28 — SPICE component authoring polish

### Frontend

- **IEEE schematic symbols on the canvas.** `apps/frontend/src/canvas/nodes/component-symbols.tsx` adds a registry of hand-drawn SVG symbols keyed by `metadata.name`, replacing the generic rectangle/circle render with proper schematic art: zigzag resistor, parallel-plate capacitor, four-hump inductor, source circle with DC/SIN/PULSE/EXP/PWL/noise glyphs, IEEE diode (standard + Zener), ground triangle, voltage and current switches, NPN/PNP BJT, and N/P MOSFET. `BlockSymbol` consults the registry first and falls back to the previous primitive render for any block type without a hand-drawn symbol; metadata YAMLs and the schema are untouched. Primary parameter values (R, C, L, V, I) are formatted with SI prefixes (1000 → `1 kΩ`, 1e-6 → `1 µF`) and shown below the body.

- **Double-click parameter panel.** `apps/frontend/src/inspector/ComponentParamsPanel.tsx` opens a modal on double-click that surfaces every model parameter for SPICE devices grouped by category (DC, Capacitance, Transit time, Temperature, Noise, …). A `Model level` dropdown swaps the visible parameter set live; values persist by SPICE name across level switches. `device-models.ts` enumerates every parameter from the ngspice 46 reference tables (working-tools/pdf-to-md/output/ngspice-46-manual.md) for: passives (R, C, L, switches) with their instance and `.MODEL` extensions; Diode Level 1 (Shockley); JFET Level 1; MESFET Level 1 (Statz); MOSFET Levels 1/2/3/6/9 (classic SPICE) including the Level 2 (UCRIT/UEXP/VMAX/NEFF/NFS/DELTA) and Level 3 (THETA/ETA/KAPPA) deltas; BJT Level 1 (Gummel-Poon). Compact models above the classic levels — BSIM3/4, BSIM-SOI, BSIM-CMG, PSP, EKV, MVS, L_UTSOI, HICUM, VBIC, MEXTRAM, HiSIM — are listed as level options with `raw=true`, presenting a textarea for the user to paste a full `.MODEL` card body. Field-by-field editors for those compact models are deferred per device.

- **Library activity polish.** Each sidebar entry now renders a scaled-down `BlockSymbol` as a preview to the left of the label (sized 56×40, scaled to 0.6) and drops the dotted catalog name (`passive.resistor`, `physical_electrical.semiconductor.bjt_npn`). The `Block Library` title plus simulator-filter dropdown are now sticky inside the scroll container so they no longer disappear when scrolling categories. The simulator-compat lists in `simulator-compat.yaml` are trimmed: signal-flow and control blocks (`signal.constant`, `signal.step`, `control.*`, `sinks.scope`) no longer appear under ngspice or Xyce — both lists now mirror the SPICE-only enumeration in `Misc/spice-simulator-analsys/SIMULATOR-COMPONENT-SUPPORT.md`. SciPy keeps the signal-flow set since it is the control-system backend.

- **Canvas background switcher.** A `Canvas background` submenu in `View ▾` lets the user pick White, Light grey, Cream, or Dark. The selection persists in `localStorage` under `gensim.ui.canvas-bg.v1` and applies via a `data-canvas-bg` attribute on the canvas root.

### Fixes

- **`Maximum update depth exceeded` on selecting a second block of a different type.** Caused by `Canvas.tsx` mirroring ReactFlow's internal `onSelectionChange` back into the Zustand selection store after `onNodeClick` already wrote it; the round-trip re-rendered nodes, which re-fired the callback, which re-wrote selection, looping until React aborted with a white screen. `onNodeClick` is now the sole canonical writer; ReactFlow's `onSelectionChange` is a no-op. `getMetadataPortCenters` also skips ports lacking `side`/`offset` so the sidebar preview can safely render minimal test-fixture metadata.

### Validation snapshot
- Frontend Vitest: `pnpm --filter @gensim/frontend test` — 378 pass / 6 skipped (intentional `xfail`s).
- Frontend typecheck: `pnpm --filter @gensim/frontend typecheck` ✅
- Playwright crash-probe (insert 10 component types, click each in order): ✅

### Known gaps
- `tests/e2e/smoke.spec.ts` (`signal.step → control.pid → sinks.scope`) is red at HEAD because of a pre-existing block-name drift between the test and the current catalog. Not introduced by this work; tracked for a follow-up fix.

---

## 2026-05-24 — All epics complete milestone

### Highlights
- FE-63 complete: .gsim_sch roundtrip gate tests and fixture documentation finalized.
- FE-66 complete: Signal Attributes blocks wired in frontend inspectors and library integration.
- FE-07 complete: keymap drift CI check validated with full frontend gate passing.
- Backend gate stabilized: legacy float-coordinate validation restored before IR-1 and equation template registry cross-validation made robust for templates without `state_vars()`.

### Validation snapshot
- Frontend: `pnpm --filter @gensim/frontend test` ✅
- Frontend typecheck: `pnpm --filter @gensim/frontend typecheck` ✅
- Backend: `scripts/aw-test-backend.sh ALL` ✅ (`PASS`)

### Project status
- `progress.frontend.yaml`: all epics complete.
- `progress.backend.yaml`: all epics complete.
- No active Archon workflows.
