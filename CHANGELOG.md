# Changelog

## 2026-11-09 — The engine says what it has (0.4.0)

### Added

- **The component library comes from the engine.** There were two
  descriptions of every component: a catalogue kept in this repository and
  the engine's own registry, and they disagreed — of 26 components whose
  parameters both described, 15 agreed and 10 did not, each disagreement a
  parameter the inspector offered and the compiler rejected, or the reverse.
  The engine now ships the library itself and serves it through
  `gsim_py.catalog()`; this front end generates its catalogue from that call
  and displays it. There is no second list to keep. A CI job rebuilds the
  catalogue from the engine and fails on any difference, so the two cannot
  drift apart again.

  Merging the two descriptions collapsed 26 duplicate spellings, taking the
  library from 265 components to 239, and claimed 32 registry types that
  nothing in the catalogue had ever named. Every one of the 239 now names a
  registry type or declares that it compiles nowhere; 60 compile. Which ones
  is no longer written down anywhere: `compilable` is derived from the
  registry when the catalogue is built, so it cannot disagree with what the
  compiler will actually do.

  Components the engine spells differently kept their old names as aliases,
  so a sheet saved before this release opens unchanged.

- **The schematic's keyboard shortcuts win over VS Code's.** A webview only
  receives a keystroke the workbench did not claim first, so 28 of this
  editor's chords never reached it: `Ctrl+R` opened VS Code's recent-files
  list instead of rotating the selection, and nothing on screen explained
  why. Those 28 are now contributed as keybindings conditioned on a
  schematic being the active editor, and forwarded into the webview.

  The new setting **General Simulator › Override VS Code Keybindings**
  turns this off and gives the chords back. It is on by default. It applies
  only while a schematic tab is focused — a source file, the explorer and
  the terminal are untouched either way, and the setting takes effect
  without a reload. `docs/keyboard-conflicts.md` lists all 58 collisions,
  generated from the keymap, including the 30 that need no contribution
  because they are editor-scoped and never fired over a webview anyway.

- **A search box in the library.** 239 components in a tree is not something
  to scroll. Escape clears it.

- **A wire can be dropped onto a wire.** Releasing a drag on an existing
  conductor splices a junction into it at the nearest point on the segment,
  rather than requiring a port at both ends.

### Fixed

- **A simulation that failed said nothing at all.** The backend answered in
  about a millisecond with a precise reason — `SolverUnavailable: gsim_py is
  not installed, and gsim_tools.schematic needs it` — and the Run button
  looked dead: the word `gsim_py` appeared nowhere on screen. The failure
  path wrote to the Output panel and the Problems list, both of which live
  in the bottom panel, which starts hidden and is not mounted in every
  shell. The validation path a few lines above opened it; this one never
  did.

  Every failure now reports through one helper: the full text to Output and
  Problems, the panel opened on Problems, and a toast carrying the first
  line — the toast because it does not depend on a panel existing. The Run
  dropdown had a second silent path that never checked the result status at
  all, and set an empty waveform manifest on failure, so a failed run showed
  an empty plot instead of a reason.

---

## 2026-11-06 — Rows have a floor (0.3.3)

### Fixed

- **Three axes in a short editor were squashed to nothing.** Each row took
  an equal share of whatever height was going, so three panes got about
  70 px each and, after the header, legend and measurement strip, the chart
  itself was a sliver. Rows now have a minimum height and the figure
  scrolls past it — two readable plots you scroll between beat three
  unreadable ones.

---

## 2026-11-06 — The viewer follows VS Code's theme (0.3.2)

### Fixed

- **A white chart inside a dark editor.** A webview is a separate document
  and inherits none of the workbench's styling, so nothing told the viewer
  which theme was active — it drew light regardless, a bright rectangle in
  the middle of a dark window. VS Code marks the webview body with
  `vscode-light` / `vscode-dark` / `vscode-high-contrast` and rewrites that
  class when the theme changes without a reload, so the viewer now observes
  it: right at boot, and on every switch afterwards. High contrast counts
  as dark, except its light variant, which carries both classes and would
  otherwise have read as dark.

---

## 2026-11-06 — Decimation that keeps the transient (0.3.1)

### Fixed

- **The chart kept one signal's peaks and lost the rest.** The reduction
  chose its min/max indices from the *first* signal on an axes and reused
  them for every other series, so peak preservation depended on the order
  signals were added: a switch node plotted first kept its overshoot,
  plotted second it did not, and nothing on screen said so. Replaced with a
  shared-grid min/max envelope — the time axis is bucketed so every signal
  keeps one grid, and within each bucket every signal contributes its own
  minimum and maximum. Verified on 400,000 samples of a 100 kHz switch node
  with a single-sample 96 V overshoot: reduced to ~2,700 points, the
  transient is still on the chart.
- **Zooming in never recovered detail.** The data was decimated once over
  its full extent and zoom only rescaled it, so one percent of a 250,000
  sample run left 200 points stretched across the plot. The visible window
  is now reduced instead, which costs less rather than more — the work
  follows what is on screen. Zoom far enough and the window is handed over
  exact.
- The point budget comes from the plot's width — two per pixel, the most a
  min/max reduction can distinguish — rather than a flat 20,000. On a
  measured run that is 2,728 points instead of 20,000: a 7x cut in what has
  to be stroked on every frame, which is what a constrained machine feels.

### New

- **`crates/waveform-store`** — the reduction as one Rust implementation,
  compiled natively for a server and to WebAssembly for the viewer, so both
  answer "this window of these signals, in at most this many points" the
  same way. Measured on an 11-signal, 25,000-sample result: parses in
  19 ms, full extent in 1.1 ms, a 2% window exact in 0.3 ms. Scales
  linearly to 100 M samples (763 MB per signal) at 102 ms for the full
  extent and 1.2 ms per zoom.
- `tests/properties.rs` establishes what survives a reduction: max, min and
  peak-to-peak exactly; every sample inside the drawn band, guaranteed; the
  mean within 0.03% while buckets stay finer than the waveform's period,
  and structurally wrong once they span many. Hence the rule it pins down —
  **a measurement is computed on the samples, never on the reduction the
  chart is drawn from.**

### Format

- `.gsim_sim_result` v2 separates metadata from samples: `data.kind` is
  `inline` (self-contained, as before) or `hdf5` (pointing at the file
  holding the samples and the LOD pyramid). v1 documents still open.

---

## 2026-11-06 — Results you can keep, and a viewer you can read (0.3.0)

### Waveform viewer

- **The plot fills its panel.** It was built at a fixed 800×300 whatever it
  sat in, so a maximised VS Code panel left roughly two thirds of the surface
  empty grey and a narrow one clipped the chart. It now measures its cell and
  resizes in place rather than rebuilding on every frame of a splitter drag.
- **Cursors and annotations land where their values are.** They were
  positioned with uPlot's device-pixel coordinates but laid out in CSS
  pixels, so above dpr 1 — every retina display, and VS Code at any zoom
  above 100% — each one was drawn at twice its distance from the origin and
  fell outside the plot. `overlayPx` returns what a CSS overlay needs.
- **Axes say what they show.** A rotated bare "V" became "Voltage (V)", with
  the SI prefix on the ticks. Tick labels chose precision per value, so an
  evenly spaced axis read "5.00ms 10.0ms 15.0ms"; there is now one precision
  per axis, taken from the step. A log axis labels decades instead of all
  nine minor ticks of each.
- **Stacked axes share an x origin**, so a figure can be read down a moment
  in time. An axes with one quantity has no right-hand gutter and was
  therefore wider than its neighbour by the width of a whole axis.
- **A real dark theme.** The chart was forced white under a near-black
  legend. Both halves now read one set of `--wave-*` tokens; `theme.ts`
  hands them to the canvas, which CSS cannot reach.
- **Measurements are reachable.** RMS, mean, min, max, peak-to-peak,
  frequency, period, rise and fall time, duty cycle and integral existed,
  were tested, and were mounted nowhere. They are now a strip above each
  plot — a few as columns, a row per trace, the rest one menu away, over the
  full run or between cursors A and B — computed in a worker that keeps the
  samples rather than copying them per request.
- **Per-trace display gain.** A 2 A current next to a 48 V rail is a flat
  line. Scaling it is display-only — measurements, cursors and exports read
  the real samples — and the legend shows "×10" permanently.
- **Past runs.** Up to four previous runs are kept and drawn behind the
  current one, each in its signal's colour at falling contrast and labelled
  with how old it is ("V(out) [1]"). A run on a different time base is left
  out rather than resampled.
- **The signal browser lists what is there.** It read only the live kernel's
  last manifest, so a saved result showed "No simulation results available"
  beside three populated charts. Each signal now has a checkbox, and the bar
  names the axes it adds to; a differing quantity gets its own y-axis.

### New file format

- **`.gsim_sim_result`** — a simulation result as one self-contained file:
  sweep axis, signals with units and quantities, and the layout they were
  shown in. Double-clicking it in the Explorer opens the viewer, with no
  kernel running. Until now a result lived only in the kernel's private
  cache under a session-scoped id, so it could not be committed, attached to
  a review, reopened next week, or compared against one from another branch.
  Samples are base64 little-endian doubles, so a round trip is exact.
  Spec: `docs/specs/gsim-sim-result-format-spec.md`.
- The editor is read-only: a result is derived data, so there is no phantom
  dirty dot and no Ctrl+S that rewrites a measurement. It does reload when
  the file changes on disk.

### Export

- One axes **or a whole figure**, as an **image or as data**: PNG, JPEG,
  SVG, PDF, CSV, and `.gsim_sim_result`. A figure exports as one stacked
  image rather than its first pane. Each format states what it costs before
  it is chosen — CSV drops the units and the last bits; the result file
  keeps both.

### Fixed

- `.gitignore` carried a bare `results/` under "Simulation output", which
  matches a directory of that name at any depth. It silently swallowed the
  result format's whole implementation and schema, with `git add -A`
  reporting nothing wrong.
- The three formats this extension owns now open as JSON in the text
  editor, so the raw file has highlighting and folding.

### Tooling

- `scripts/render-waveform.mjs` renders the viewer to a PNG, the way
  `render-schematic.mjs` does for the schematic: no assertion notices that a
  grid out-weighs the data.
- `scripts/stress-waveform.mjs` loads a real `.gsim_sim_result` through the
  production path and reports open time and worst-frame interval under zoom
  and pan — worst, not mean, because one 300 ms frame is what "it froze"
  means.

---

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
