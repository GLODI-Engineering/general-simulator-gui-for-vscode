# Developer guide — `general-simulator`

This guide covers day-to-day development: environment setup, running
tests, CI gates, extending the system, and the agent workflow. It is
the practical counterpart to the architecture specs in `docs/specs/`.

---

## Table of contents

1. [Environment setup](#1-environment-setup)
2. [Python workspace](#2-python-workspace)
3. [TypeScript / Node workspace](#3-typescript--node-workspace)
4. [Backend development](#4-backend-development)
5. [Frontend development](#5-frontend-development)
6. [Schema system](#6-schema-system)
7. [Block catalog](#7-block-catalog)
8. [Testing reference](#8-testing-reference)
9. [CI gates](#9-ci-gates)
10. [Pre-commit hooks](#10-pre-commit-hooks)
11. [IPC message reference](#11-ipc-message-reference)
12. [Type system notes](#12-type-system-notes)
13. [Agent / AI workflow](#13-agent--ai-workflow)
14. [Debugging tips](#14-debugging-tips)
15. [Common pitfalls](#15-common-pitfalls)

---

## 1. Environment setup

### Required tools

```
Python  ≥ 3.11
uv      ≥ 0.5       (python package manager + workspace runner)
Node.js ≥ 20 LTS
pnpm    = 9.12.0    (enforced by packageManager field)
Rust    stable      (only for Tauri desktop builds)
```

Install pnpm via corepack (already bundled with Node):

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
```

Install uv:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### First-time bootstrap

```bash
git clone <repo> general-simulator && cd general-simulator

# Python: create .venv and install all workspace members + dev deps
uv sync

# Node: install all packages across the pnpm workspace
pnpm install

# Install git hooks (ruff, mypy, pytest pre-commit gate)
uv run pre-commit install --install-hooks

# Playwright browser binaries
npx playwright install
```

After this, `.venv/` is usable directly or via `uv run <cmd>`.

---

## 2. Python workspace

The workspace root is `pyproject.toml`. Members:

| Member | Path | Purpose |
|--------|------|---------|
| `kernel-sidecar` | `apps/kernel-sidecar/` | IPC server process |
| `simulator` | `packages/simulator/` | Compiler + solvers + postprocess |
| `blocks` | `packages/blocks/` | Block equation templates |
| `schemas` | `packages/schemas/` | (reserved for Python schema gen) |
| `components` | `packages/components/` | Device models (future) |
| `kernel-core` | `packages/kernel-core/` | Shared kernel primitives (future) |
| `synthesis` | `packages/synthesis/` | Code generation (future) |
| `engine-xyce` | `packages/engine-xyce/` | Xyce subprocess wrapper (future) |

### Running Python tools

Always use `uv run` to stay in the workspace virtual environment:

```bash
uv run pytest                        # run all tests in testpaths
uv run ruff check .                  # lint everything
uv run ruff format .                 # format everything
uv run mypy apps/ packages/ --ignore-missing-imports
```

### Adding a Python dependency

Add to the relevant member's `pyproject.toml` under `[project.dependencies]`,
then run `uv sync` at the workspace root.

---

## 3. TypeScript / Node workspace

The pnpm workspace is defined in `pnpm-workspace.yaml`. Members:

| Member | Path | Purpose |
|--------|------|---------|
| `@gensim/frontend` | `apps/frontend/` | React canvas app |
| `@gensim/schemas` | `packages/schemas/` | Schema codegen target |
| `tests/schemas` | `tests/schemas/` | Schema Vitest suite |

### Scripts

```bash
# Root-level
pnpm lint:check          # Biome check (no write)
pnpm lint                # Biome check + fix
pnpm e2e                 # Playwright E2E tests
pnpm e2e:ui              # Playwright with interactive UI

# Frontend only
pnpm --filter @gensim/frontend dev        # Vite dev server
pnpm --filter @gensim/frontend build      # Production build
pnpm --filter @gensim/frontend test       # Vitest run
pnpm --filter @gensim/frontend typecheck  # tsc --noEmit
```

### Running frontend tests directly

```bash
cd apps/frontend
npx vitest run                         # all tests
npx vitest run src/store/graph.test.ts # specific file
npx vitest run src/canvas/             # all tests under a dir
npx vitest                             # watch mode
```

---

## 4. Backend development

### Module map

```
apps/kernel-sidecar/src/kernel_sidecar/
├── __main__.py            Entry point (argparse: --port, --token, --workdir, --connect-timeout)
├── server.py              Async WS server; HTTP/WS dispatch; connect-timeout
├── config/
│   └── settings.py        JSON settings file (atomic write-tmp+rename)
├── ipc/
│   ├── envelope.py        Message dataclass; MessageType StrEnum
│   ├── dispatch.py        Handler registry; routes by message type
│   ├── handshake.py       Token verification (hmac.compare_digest)
│   └── handlers/
│       ├── execute.py     Code execution + stdout streaming + workspace update
│       ├── simulate.py    Full pipeline orchestration (background task)
│       ├── workspace.py   workspace_get + binary frame encoding
│       ├── kernel.py      kernel_status transitions + kernel_restart
│       └── completion.py  Completion stub (returns empty list in v1)
├── kernel/
│   ├── namespace.py       Persistent globals dict; pre-imports; thread lock
│   ├── executor.py        ThreadPoolExecutor; CancelToken; eval/exec compile
│   ├── stdout.py          contextvars-based stdout/stderr routing per request
│   ├── snapshot.py        workspace_update builder; array previews
│   └── matplotlib_hook.py Agg-backend figure capture; base64 PNG emission
└── waveform/
    ├── manifest.py        manifest.json reader
    └── slice_server.py    aiohttp HTTP server co-located on WS port

packages/simulator/src/simulator/
├── compiler/
│   ├── gsim_loader.py     .gsim JSON → validated dict (jsonschema optional)
│   ├── ir1_builder.py     dict → IR1Graph (topology)
│   ├── ir2_lowering.py    IR1Graph → IR2 (flat state vector, topo sort, loop detection)
│   ├── scipy_compiler.py  IR2 → CompiledModel (f(t,x)→dx/dt closure)
│   └── codegen_state.py   CompiledModel dataclass; observation hooks
├── ir/
│   ├── ir1.py             IR1 dataclasses (IR1Block, IR1Connection, IR1Graph)
│   └── ir2.py             IR2 dataclasses (state_layout, output_layout, eval_order)
├── equation_templates/
│   ├── protocol.py        BlockEquations ABC (state_vars, derivatives)
│   └── loader.py          Discovers + imports all equations.py under packages/blocks/
├── solvers/
│   ├── protocol.py        SolverBackend ABC; CancelToken; ProgressCallback; ResultBundle
│   ├── scipy_solver.py    ScipySolver (Radau, rtol=1e-6, atol=1e-9, dense_output)
│   ├── path_discovery.py  find_solver(): explicit → settings → env var → PATH → error
│   └── xyce_solver.py     XyceSolver stub (raises NotImplementedError on solve())
├── selection/
│   └── auto_select.py     select_backend(): routes control IR-2 → ScipySolver
└── postprocess/
    ├── result_writer.py   ResultBundle → manifest.json + time.npy + signals/*.npy
    └── __init__.py
```

### Key flows

#### Simulation pipeline

```
handle_simulate (IPC handler)
  │ spawns background task
  ▼
_do_simulate
  ├─ gsim_loader.load(gsim_doc)     → dict
  ├─ ir1_builder.build(doc)         → IR1Graph
  ├─ ir2_lowering.lower(ir1)        → IR2
  ├─ scipy_compiler.compile(ir2)    → CompiledModel
  ├─ select_backend(ir2)            → ScipySolver
  ├─ solver.solve(compiled, opts)   → ResultBundle
  └─ result_writer.write(bundle)    → manifest.json + npy files
```

#### Execute path

```
handle_execute
  ├─ emit kernel_status busy
  ├─ MatplotlibHook.capture_context()   (context manager)
  │   ├─ stdout_router context manager  (routes sys.stdout/stderr)
  │   ├─ executor.execute(code, ns)     (ThreadPoolExecutor)
  │   │   ├─ compile(code, mode="eval") → eval last expression
  │   │   └─ compile(code, mode="exec") → exec, return None
  │   └─ collect figures → emit plot_ready(s)
  ├─ emit execute_result
  ├─ emit workspace_update (snapshot of user namespace)
  └─ emit kernel_status idle
```

### Startup sequence

```
__main__.py
  ├─ parse --port, --token, --workdir, --connect-timeout
  ├─ bind ws://127.0.0.1:<port>
  ├─ print "KERNEL_READY port=<N> token=<hex>"   ← Tauri watches stdout
  └─ serve (single-connection rule: second client → code 4000)
       └─ verify_handshake → dispatch → handlers
```

---

## 5. Frontend development

### Module map

```
apps/frontend/src/
├── App.tsx                  Root; registers all activities, tabs, bindings
├── store/
│   ├── graph.ts             Zustand: blocks, wires, undo stack; transact()
│   ├── graph-diff.ts        Diff computation for undo frames
│   ├── ui.ts                Zustand: selection, zoom/pan, panel visibility, sizes
│   ├── inspector.ts         Zustand: bound selection, dirty edits
│   ├── ipc.ts               Zustand: kernel status, pendingIds, last manifest
│   ├── library.ts           Zustand: catalog entries, recently used
│   └── index.ts             Aggregator (useStores())
├── canvas/
│   ├── Canvas.tsx           React Flow host; derives nodes/edges from graph store
│   ├── derive-flow-state.ts graph store → React Flow props (no mutation)
│   ├── coords.ts            toScreen() / toModel(); integer round-trip guaranteed
│   ├── keymap.ts            Binding registry; conflict guard; dispatcher
│   ├── keymap-types.ts      KeyBinding, KeyContext types
│   ├── KeymapProvider.tsx   Global keydown listener
│   ├── undo.ts              Stack clear on New/Open; redo clear on mutation
│   ├── clipboard.ts         Copy/paste/cut; UUID regeneration; interior-wire filter
│   ├── grid/
│   │   ├── GridLayer.tsx    Background grid dots; thinning at low zoom
│   │   └── grid.ts          Grid dot positions
│   ├── nodes/
│   │   ├── BlockNode.tsx    Wrapper node for React Flow
│   │   ├── BlockSymbol.tsx  Data-driven SVG renderer (rect/circle/triangle/custom)
│   │   ├── Port.tsx         Port markers; domain colors
│   │   └── port-hit-test.ts Screen-space hit box; resolves block+port from cursor
│   ├── snapping/
│   │   └── snap.ts          Snap helper: port > wire > grid priority
│   ├── selection/
│   │   ├── Selection.ts     Click/marquee/Shift-click/Ctrl+A logic
│   │   ├── MarqueeLayer.tsx Live drag highlight
│   │   ├── nudge.ts         Arrow / Shift+Arrow nudge (one transact frame)
│   │   └── drag.ts          Drag-move with snap; Esc cancel; Space axis-lock
│   ├── transforms/
│   │   ├── rotate.ts        Ctrl+R / Ctrl+Shift+R; pivot policy
│   │   ├── mirror.ts        Ctrl+I; canonical mirror×rotation form
│   │   └── composition.md   Document: transform composition rules
│   └── router/
│       ├── interactive-draw.ts  Drag from port; posture toggle; split-on-body
│       ├── preview-layer.tsx    Live 2-segment preview
│       ├── cleanup.ts           Post-move re-route (deterministic, pinned bends)
│       ├── pinning.ts           Pin/unpin/drag-waypoint
│       └── compatibility.ts     Port-kind matrix; forbidden cue
├── library/
│   ├── catalog.ts           Loads metadata.yaml files; cross-field validation
│   ├── catalog-manifest.json Build-time snapshot of the catalog
│   ├── search.ts            Fuzzy ranking: recently-used → prefix → substring
│   ├── QuickInsert.tsx      Ctrl+. palette; arrow+Enter inserts at cursor
│   ├── LibraryActivity.tsx  core.library activity; collapsible category tree
│   ├── SidebarItem.tsx      Tree item with drag-to-canvas
│   └── register.ts          Registers core.library in ActivityRegistry
├── inspector/
│   ├── Inspector.tsx        Secondary side bar; 0/1/N-selection states
│   ├── focus-main-param.ts  Alt+Enter → focuses the main_param editor
│   └── editors/
│       ├── NumberInput.tsx
│       ├── VectorInput.tsx
│       ├── Dropdown.tsx
│       └── StringInput.tsx
├── explorer/
│   ├── ExplorerActivity.tsx core.explorer; recent models from StorageAdapter
│   ├── RecentModelsList.tsx
│   └── register.ts
├── search/
│   ├── SearchActivity.tsx   core.search; live substring search in model
│   ├── find-in-model.ts     Returns up to 100 results; truncates with +N more
│   └── register.ts
├── palette/
│   ├── CommandPalette.tsx   Ctrl+. command palette; auto-populated from keymap
│   └── registry-bridge.ts  Derives palette entries from keymap registry
├── file/
│   ├── StorageAdapter.ts    Interface: list/load/save/saveAs/delete/import/export
│   ├── file-ops.ts          Command layer (Ctrl+N/O/S/Shift+S/Shift+E/W)
│   ├── serializer.ts        ModelDocument → canonical JSON bytes
│   ├── deserializer.ts      bytes → ModelDocument (schema-validated)
│   ├── autosave.ts          Debounced 500ms auto-save on every transact()
│   ├── export.ts            Synthetic <a download> for Export
│   ├── import.ts            <input type=file> for Import
│   ├── round-trip.test.ts   Property: 200 random models serialize idempotently
│   ├── test-fixtures/
│   │   └── generators.ts    Random ModelDocument generator (fast-check)
│   └── adapters/
│       ├── TauriFsAdapter.ts   Desktop: @tauri-apps/plugin-fs + dialog
│       ├── IndexedDbAdapter.ts Web: IndexedDB "general-simulator" DB, "models" store
│       ├── idb-schema.ts       Object-store schema + version migrations
│       └── select-adapter.ts   Boot-time: returns Tauri if window.__TAURI__ present
├── ipc/
│   ├── client.ts            WebSocket client; streaming; Promise resolution
│   ├── binary-frame.ts      128-byte header + raw bytes decoder
│   ├── types.ts             TypeScript envelope types
│   ├── transport.ts         Boot-time: stub vs real WS based on VITE_IPC_TRANSPORT
│   ├── error-map.ts         Translates known kernel tracebacks to user messages
│   └── stub/
│       ├── stub-kernel.ts   In-process fake kernel (VITE_IPC_TRANSPORT=stub)
│       └── fixtures.ts      Canned responses + stub waveform manifest
├── workspace/
│   ├── WorkspaceTab.tsx     Bottom tab host for REPL + variable list
│   ├── VariableList.tsx     Variable list; click → workspace_get
│   ├── VariableValue.tsx    Scalar inline / array preview + "view full"
│   ├── CodeEditor.tsx       Monaco in Python mode; Shift+Enter / Ctrl+Enter
│   ├── Console.tsx          Stdout/stderr stream display
│   └── register.ts          Registers core.workspace in BottomTabRegistry
├── waveform/
│   ├── WaveformTab.tsx      uPlot host; auto-opens on simulate_result
│   ├── SignalLegend.tsx     Trace legend; toggle visibility
│   ├── cursor.ts            Crosshair cursor; instantaneous value readout
│   ├── lod-client.ts        getSlice(); LRU cache; cache-miss → HTTP GET
│   ├── prefetch.ts          Adjacent-window prefetch in idle callback
│   └── register.ts          Registers core.waveform in BottomTabRegistry
├── output/
│   ├── OutputTab.tsx        Streams execute_stream chunks from IPC store
│   ├── LogView.tsx          Virtualized log; auto-scroll; per-stream filter
│   └── register.ts          Registers core.output in BottomTabRegistry
├── problems/
│   ├── ProblemsView.tsx     Shared view used in both Activity and BottomTab
│   ├── problems-store.ts    Issues list; hasErrors; badge count
│   └── register.ts          Registers core.problems × 2 (Activity + BottomTab)
└── shell/
    ├── TopBar.tsx
    ├── ActivityBar.tsx       Left icon column; active = left-edge accent
    ├── PrimarySideBar.tsx    Renders active activity component
    ├── SecondarySideBar.tsx  Inspector slot
    ├── BottomPanel.tsx       Tab strip + tab content
    ├── StatusBar.tsx         Kernel dot, zoom, validation count, cursor coords
    ├── StartupModal.tsx      Recent-models picker on web launch
    ├── RunButton.tsx         Ctrl+T; idle/busy/error states
    ├── run.ts                Simulate flow: validate → IPC → waveform
    ├── registries/
    │   ├── ActivityRegistry.ts  register(); conflict guard; ordering
    │   └── BottomTabRegistry.ts Same pattern
    └── layout.css
```

### State management

All canvas state flows through Zustand stores. React Flow is used
only as a rendering host — its internal state is never mutated
directly. The derivation path is:

```
graph store (blocks + wires)
  ↓  derive-flow-state.ts
React Flow nodes + edges props
  ↓  rendered by React Flow
SVG canvas
```

User interactions from React Flow (drag, zoom, pan) are mapped to
graph-store mutations or UI-store updates — never to React Flow's
own `setNodes` / `setEdges`.

### Undo / redo

All mutations are wrapped in `transact(name, fn)`:

```typescript
transact("move blocks", () => {
  moveBlocks(selectedIds, delta);
});
```

`transact` snapshots the affected slices before and after, pushes
a `{name, before, after}` frame to the undo stack, and clears the
redo stack. `undo()` / `redo()` replay diff frames.

One mutation = one undo frame. Nudge, drag-move, and parameter edits
each produce exactly one frame regardless of how many sub-operations
they involve.

### Keymap contexts

Bindings are context-sensitive. Active contexts are resolved from
current UI state at dispatch time:

| Context | When active |
|---------|------------|
| `global` | Always |
| `canvas` | Canvas is focused, no modal open |
| `selection` | Canvas + non-empty selection |
| `drawing-wire` | Wire draw in progress |
| `in-place-edit` | Text input focused inside canvas |
| `modal` | Any modal open |

The `/` posture-toggle binding only fires in `drawing-wire` — it
does not interfere with browser Find or other slash behaviors in
other contexts.

---

## 6. Schema system

### Sources

All schemas live in `packages/schemas/definitions/`:

```
definitions/
├── model/
│   ├── gsim.schema.json          .gsim model file format
│   ├── port-kind.schema.json     PortKind domain definitions
│   └── README.md
└── blocks/
    ├── block-metadata.schema.json  Catalog entry format
    └── README.md
```

### Constraints enforced by schema

**gsim.schema.json:**
- `Block.position`: array of exactly 2 integers (no floats)
- `Block.rotation`: enum [0, 90, 180, 270]
- `Block.mirror`: enum ["none", "x", "y"]
- `Wire.waypoints`: even-length array of integer pairs
- `ModelDocument.schema_version`: const 1
- `additionalProperties: false` throughout

**block-metadata.schema.json:**
- `name`: kebab-case pattern
- `behavior.state_count`: integer or "dynamic"
- `behavior.domain`: enum [control, signal, electrical, …]
- Ports reference port-kind via `$ref`

### Cross-field validation (enforced by loader, not schema)

The `catalog.ts` loader and `gsim_loader.py` enforce constraints
that JSON Schema cannot express:

- `default` must match the declared param `type`
- `main_param` must name an existing param
- `variadic_inputs.count_from` must name a param of compatible type
- `behavior.equation_template` must follow `<category>.<name>` pattern

### Regenerating generated types (FE-02, planned)

```bash
pnpm -F @gensim/schemas codegen
```

This regenerates `packages/schemas/generated/typescript/` and
`packages/schemas/generated/python/`. The CI drift check will fail
if the generated files are not committed after a schema change.

---

## 7. Block catalog

### Directory structure

```
packages/blocks/src/blocks/
├── signal/
│   ├── constant/
│   │   ├── metadata.yaml
│   │   └── equations.py
│   └── step/
│       ├── metadata.yaml
│       └── equations.py
└── control/
    ├── gain/
    ├── sum/
    ├── integrator/
    ├── derivative/
    ├── pid/
    ├── transfer_function/
    ├── saturation/
    └── sinks/
        └── scope/
```

### The `BlockEquations` protocol

```python
class BlockEquations(Protocol):
    def state_vars(self, params: dict[str, Any]) -> list[str]: ...
    def derivatives(
        self,
        t: float,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
    ) -> dict[str, float]: ...
    def output(
        self,
        t: float,
        state: dict[str, float],
        inputs: dict[str, float],
        params: dict[str, Any],
    ) -> dict[str, float]: ...
```

`state_vars()` returns the names of the state variables; the count
must match `metadata.yaml`'s `behavior.state_count` (or the template
must be declared `dynamic`).

`derivatives()` is a pure function — no I/O, no module-level mutable
state. The simulator calls it inside `solve_ivp`'s `f(t, x)`.

### Adding a block

Use the `/new-block` skill. If hand-rolling:

1. Create the directory under `packages/blocks/src/blocks/<cat>/<name>/`.
2. Write `metadata.yaml` — validate against the block-metadata schema.
3. Write `equations.py` — implement `state_vars()`, `derivatives()`, `output()`.
4. Add tests to `packages/blocks/tests/test_equations.py`.
5. Register in the frontend catalog (currently in
   `apps/frontend/src/library/catalog-manifest.json` and
   `apps/frontend/scripts/build-catalog-manifest.ts`).

The `TemplateLoader` (BE-10) auto-discovers `equations.py` files at
runtime — no registration needed on the Python side.

---

## 8. Testing reference

### Backend tests

| File | Epic | Tests | What it covers |
|------|------|-------|----------------|
| `test_cli.py` | BE-01 | 6 | Argparse, help output, port/token args |
| `test_settings.py` | BE-01 | 12 | Settings round-trip, concurrent write safety |
| `test_server.py` | BE-02 | ~35 | Single-connection rule, unknown-type error, handler dispatch |
| `test_envelope.py` | BE-02 | ~10 | Message dataclass round-trips |
| `test_handshake.py` | BE-03 | 4 | Good/bad token, KERNEL_READY stdout |
| `test_namespace.py` | BE-04 | 13 | Pre-imports, persistence, reset |
| `test_executor.py` | BE-05 | 6 | Concurrent exec, cancel, eval vs exec |
| `test_stdout.py` | BE-06 | 6 | Per-request routing, exception restore |
| `test_snapshot.py` | BE-07 | 7 | Pre-import filter, array preview, size bound |
| `test_matplotlib_hook.py` | BE-08 | 4 | PNG capture, no popup, memory |
| `test_binary_frame.py` | BE-09 | 18 | Header parse, round-trip dtypes, scalar path |
| `test_template_loader.py` | BE-10 | 4 | Discovery, bad import isolation, state_count mismatch |
| `test_equations.py` | BE-11 | 28 | Edge cases per block; closed-form checks |
| `test_ir1_builder.py` | BE-12 | 4 | Empty model, fixture topology, sum ports, float rejects |
| `test_ir2_lowering.py` | BE-13 | 6 | Closed-loop ok, algebraic loop rejected, layout sizes |
| `test_scipy_compiler.py` | BE-14 | 6 | dx shape, gain/integrator numerics, determinism |
| `test_scipy_solver.py` | BE-15 | 4 | LP step-response, rtol/atol override, cancel |
| `test_result_writer.py` | BE-16 | 8 | Round-trip npy, manifest schema, duplicate guard |
| `test_slice_server.py` | BE-17 | 5 | manifest GET, signal GET, path-traversal 400, no-token 401 |
| `test_simulate.py` | BE-18 | 3 | Happy path, algebraic-loop error, cancel mid-solve |
| `test_kernel_status.py` | BE-19 | 4 | Status sequence, restart clears namespace |
| `test_completion.py` | BE-20 | 3 | Empty reply, timing |
| `test_solver_selection.py` | BE-21 | 5 | Control → ScipySolver, circuit → NotImplementedError |
| `test_path_discovery.py` | BE-22 | 6 | env-var, settings-file, PATH, not-found error |
| `tests/backend/e2e/` | BE-23 | 3 | Real sidecar smoke, timing, circuit xfail |

### Frontend tests (Vitest)

| File | Epic | Tests |
|------|------|-------|
| `store/graph.test.ts` | FE-03 | 9 |
| `store/ui.test.ts` | FE-04 | 7 |
| `store/inspector.test.ts` | FE-04 | 5 |
| `store/ipc.test.ts` | FE-04 | 7 |
| `store/library.test.ts` | FE-04 | 4 |
| `shell/shell.test.tsx` | FE-05 | 2 |
| `shell/registries/ActivityRegistry.test.ts` | FE-05 | 3 |
| `shell/registries/BottomTabRegistry.test.ts` | FE-05 | 3 |
| `canvas/keymap.test.ts` | FE-06 | 15 |
| `canvas/KeymapProvider.test.tsx` | FE-06 | 1 |
| `canvas/Canvas.test.tsx` | FE-08 | 2 |
| `canvas/grid/grid.test.ts` | FE-09 | 2 |
| `canvas/coords.test.ts` | FE-09 | 4 |
| `canvas/snapping/snap.test.ts` | FE-10 | 6 |
| `canvas/nodes/BlockSymbol.test.tsx` | FE-11 | 14 |
| `canvas/nodes/port-hit-test.test.ts` | FE-12 | 2 |
| `canvas/selection/Selection.test.tsx` | FE-13 | 3 |
| `canvas/selection/nudge.test.ts` | FE-14 | 5 |
| `canvas/selection/drag.test.tsx` | FE-15 | 3 |
| `canvas/transforms/rotate.test.ts` | FE-16 | 5 |
| `canvas/transforms/mirror.test.ts` | FE-16 | 3 |
| `canvas/clipboard.test.ts` | FE-17 | 4 |
| `canvas/undo.test.ts` | FE-18 | 2 |
| `canvas/router/interactive-draw.test.tsx` | FE-19 | 4 |
| `canvas/router/cleanup.test.ts` | FE-20 | 3 |
| `canvas/router/pinning.test.tsx` | FE-21 | 2 |
| `canvas/router/compatibility.test.ts` | FE-22 | 6 |
| `library/catalog.test.ts` | FE-23 | 6 |
| `library/QuickInsert.test.tsx` | FE-24 | 2 |
| `library/search.test.ts` | FE-24 | 4 |
| `library/LibraryActivity.test.tsx` | FE-25 | 2 |
| `explorer/ExplorerActivity.test.tsx` | FE-25b | 2 |
| `search/find-in-model.test.ts` | FE-25b | 4 |
| `search/SearchActivity.test.tsx` | FE-25b | 1 |
| `inspector/Inspector.test.tsx` | FE-26 | 2 |
| `inspector/focus-main-param.test.tsx` | FE-27 | 3 |
| `palette/CommandPalette.test.tsx` | FE-28 | 2 |
| `file/serializer.test.ts` | FE-29 | 3 |
| `file/deserializer.test.ts` | FE-29 | 3 |
| `file/file-ops.test.ts` | FE-29 | 2 |
| `file/adapters/TauriFsAdapter.test.ts` | FE-29 | 2 |
| `file/adapters/IndexedDbAdapter.test.ts` | FE-29b | 4 |
| `file/autosave.test.ts` | FE-29b | 1 |
| `shell/StartupModal.test.tsx` | FE-29b | 1 |
| `file/export.test.ts` | FE-29b | 3 |
| `file/import.test.ts` | FE-29b | 1 |
| `file/round-trip.test.ts` | FE-30 | 2 |
| `ipc/client.test.ts` | FE-31 | 3 |
| `ipc/binary-frame.test.ts` | FE-31 | 3 |
| `ipc/stub/stub-kernel.test.ts` | FE-32 | 3 |
| `workspace/VariableList.test.tsx` | FE-33 | 2 |
| `workspace/WorkspaceTab.test.tsx` | FE-33 | 1 |
| `workspace/CodeEditor.test.tsx` | FE-34 | 2 |
| `waveform/WaveformTab.test.tsx` | FE-35 | 2 |
| `output/LogView.test.tsx` | FE-35b | 3 |
| `output/OutputTab.test.tsx` | FE-35b | 1 |
| `waveform/lod-client.test.ts` | FE-36 | 2 |
| `waveform/prefetch.test.ts` | FE-36 | 1 |
| `shell/run.test.tsx` | FE-37 | 6 |
| `shell/StatusBar.test.tsx` | FE-38 | 6 |
| `problems/ProblemsView.test.tsx` | FE-39 | 5 |
| `problems/problems-store.test.ts` | FE-39 | 4 |
| `ipc/error-map.test.ts` | FE-39 | 5 |

### Schema tests (Vitest in `tests/schemas/`)

| File | Tests | What it covers |
|------|-------|----------------|
| `test_gsim_schema.ts` | 15 | Valid/invalid .gsim fixtures; float-position rejection |
| `test_block_metadata_schema.ts` | 12 | Metadata fixtures; custom shape; state_count dynamic |
| `test_port_kind_schema.ts` | 15 | All 5 domains; 3 signal dims variants |
| `test_codegen_drift.ts` | — | Regenerates to tmpdir, diffs; planned (FE-02) |

### Playwright E2E (`tests/e2e/`)

| Spec | Scenarios | Browsers |
|------|-----------|---------|
| `smoke.spec.ts` | Quick Insert 3 blocks → wire → Ctrl+T → uPlot shows data | Chromium, Firefox, WebKit |
| `undo-redo.spec.ts` | Build model → undo to empty → redo to final; byte-equivalent | All 3 |
| `persistence.spec.ts` | Save → reload → StartupModal → open → byte-equivalent | All 3 (web); 1 (Tauri, planned) |
| `perf.spec.ts` | canvas p95 ≤16ms; Quick Insert ≤50ms; save ≤100ms | Chromium |

#### The `gs-ui-probe` dependency

The specs drive the UI through [`gs-ui-probe`](https://github.com/GLODI-Engineering/gs-ui-probe),
which lives in its own repository so that it stays free of any knowledge of
this application. `package.json` pins it to a tag:

```json
"gs-ui-probe": "git+https://github.com/GLODI-Engineering/gs-ui-probe.git#v0.2.2"
```

It is public, so CI needs no credentials for it.

**Locally**, a pinned tag means you get the released probe, not your working
copy. To edit the probe and see the change here without cutting a tag:

```bash
pnpm link ../gs-ui-probe      # live edits
pnpm install                  # back to the pinned tag
```

**To release a probe change**: `pnpm build` first — `dist/` is committed there,
because the package is consumed from git rather than a registry, so the build
output *is* the release. Then commit, tag, push, and bump the tag here. The tag
is what makes an e2e run reproducible.

---

## 9. CI gates

The full gate set (enforced by pre-commit and `.github/workflows/`):

```
┌─ Python ──────────────────────────────────────────────┐
│  ruff check .                  lint                   │
│  ruff format --check .         format                 │
│  mypy apps/ packages/ …        types                  │
│  pytest -q                     all Python tests       │
└───────────────────────────────────────────────────────┘
┌─ TypeScript ──────────────────────────────────────────┐
│  pnpm lint:check               Biome lint             │
│  cd apps/frontend              typecheck              │
│    npx tsc --noEmit                                   │
│  cd apps/frontend              unit tests             │
│    npx vitest run                                     │
│  cd tests/schemas              schema tests           │
│    pnpm vitest run                                    │
└───────────────────────────────────────────────────────┘
┌─ E2E ─────────────────────────────────────────────────┐
│  npx playwright test           web builds             │
│  (+ Tauri build, planned)      desktop build          │
└───────────────────────────────────────────────────────┘
┌─ Invariants ──────────────────────────────────────────┐
│  ./scripts/check-invariants.sh Epetra, async, smooth  │
│  (FE-07, planned) keymap drift check                  │
│  (FE-02, planned) schema codegen drift check          │
└───────────────────────────────────────────────────────┘
```

An epic reaches `complete` status only when **all** gates are green
for its touched code. The `progress.*.yaml` files track status.

---

## 10. Pre-commit hooks

`.pre-commit-config.yaml` configures hooks that run on every `git commit`:

| Hook | What it checks |
|------|----------------|
| `ruff` | Python lint + format check |
| `mypy` | Python type check |
| `check-invariants` | Architectural invariants (see AGENTS.md §2) |
| `commit-msg` | Conventional Commits format |

**Never bypass with `--no-verify`.** If a hook fails, fix the root
cause. The hook caught a real problem.

---

## 11. IPC message reference

### Frontend → Kernel

| `type` | `payload` | Description |
|--------|-----------|-------------|
| `handshake` | `{ token: string }` | First message; token from CLI |
| `execute` | `{ code: string }` | Run Python code |
| `execute_cancel` | `{ id: string }` | Cancel a pending execute |
| `workspace_get` | `{ name: string }` | Fetch full value of a variable |
| `kernel_restart` | `{}` | Clear namespace; cancel all pending |
| `completion_request` | `{ code, cursor_pos }` | Code completion (stub in v1) |
| `simulate` | `{ model: ModelDocument, options? }` | Run simulation |
| `simulate_cancel` | `{ id: string }` | Cancel a running simulation |

### Kernel → Frontend

| `type` | `payload` | Description |
|--------|-----------|-------------|
| `kernel_status` | `{ state: "idle"\|"busy"\|"restarting" }` | Status transitions |
| `execute_result` | `{ value: any }` | Final result of execute |
| `execute_stream` | `{ name: "stdout"\|"stderr", text: string }` | Stdout/stderr chunk |
| `execute_error` | `{ type: string, message: string, traceback: string[] }` | Error |
| `workspace_update` | `[{ name, type, preview, dtype?, shape? }, …]` | Namespace snapshot |
| `workspace_value` | `{ name, value }` | Full scalar value (non-ndarray) |
| `plot_ready` | `{ id, data: string }` | Base64 PNG figure |
| `completion_reply` | `{ matches: [] }` | Completion matches (empty in v1) |
| `simulate_progress` | `{ frac: number }` | Progress in [0, 1] |
| `simulate_result` | `{ status, manifest_url? }` | Simulation complete |

### Simulation options

```typescript
interface SimulateOptions {
  t_start?: number;   // default 0.0
  t_end?: number;     // default 10.0
  n_samples?: number; // default 3000
  method?: string;    // default "Radau"
  rtol?: number;      // default 1e-6
  atol?: number;      // default 1e-9
}
```

---

## 12. Type system notes

### Python (mypy)

Config is in `pyproject.toml` under `[tool.mypy]`. Key settings:

- `warn_return_any = true` — returning `Any` from a typed function is an error
- `warn_unused_ignores = true` — stale `# type: ignore` comments are errors
- `disallow_untyped_defs = true` — all functions must be typed

**Known patterns:**

`ctypes.pythonapi` returns `Any` by default. Wrap the return in
`int(...)` to satisfy `→ int` return annotations:

```python
return int(ctypes.pythonapi.PyThreadState_SetAsyncExc(
    ctypes.c_ulong(thread_id),
    ctypes.py_object(exc_type),
))
```

`json.load(f)` returns `Any`. Use an explicit local annotation to
satisfy `no-any-return`:

```python
result: dict[str, Any] = json.load(f)
return result
```

`dict[str, Any].get(key)` returns `Any | None`. After a `None`
guard, mypy narrows to `Any`, but only if the guard is in the same
function scope. In background tasks that re-fetch from payload, add
the guard locally.

### TypeScript (tsc + Biome)

Config is `apps/frontend/tsconfig.json`. Biome config is `biome.json`.
Biome warnings (lint suggestions) do not fail CI — only errors do.

---

## 13. Agent / AI workflow

### Reading order (first time on this repo)

1. `AGENTS.md` — invariants + skill index
2. `docs/agent-rules/orientation.md` — which doc answers which question
3. The relevant progress file (`progress.frontend.yaml` or `progress.backend.yaml`)
4. The spec for your epic's `area:` field

### Recurring workflows

| Task | Command / Skill | Notes |
|------|----------------|-------|
| Run tests + update progress | `/test-and-progress` | Reads progress file, runs tests, updates status |
| Add a block | `/new-block` | Scaffolds directory, YAML, equations.py, tests |
| Draft commit | `/commit` | Reads diff; follows Conventional Commits |
| Fix type errors | Read mypy output; fix root causes; never add stale `# type: ignore` |

### Two-agent model

Each epic has separate `implementation.owner` (coder-agent) and
`tests.owner` (tester-agent) tracks. The tester-agent:

- Runs tests, records results in progress YAML
- Does NOT fix implementation code — only writes the `blocked:` note
- Can mark `complete` only when all CI gates pass

### Progress file conventions

```yaml
status: review      # tests pass locally
status: blocked     # tests fail or environment is broken
status: complete    # tests pass AND all CI gates pass
```

A `blocked:` note must be actionable: exact file, line, error
message, counts. A `review:` note must record the date and test
counts.

---

## 14. Debugging tips

### Watching sidecar output

```bash
uv run python -m kernel_sidecar --port 9001 --token deadbeef... 2>&1
```

Set `GENSIM_LOG_LEVEL=DEBUG` to enable verbose IPC logging.

### Testing a single IPC message

```python
import asyncio, websockets, json, secrets

TOKEN = secrets.token_hex(32)
# (start sidecar with --port 9001 --token TOKEN)

async def main():
    async with websockets.connect("ws://127.0.0.1:9001") as ws:
        await ws.send(json.dumps({"id":"h","type":"handshake","payload":{"token":TOKEN}}))
        print(await ws.recv())
        await ws.send(json.dumps({"id":"r1","type":"execute","payload":{"code":"1+1"}}))
        while True:
            msg = json.loads(await ws.recv())
            print(msg)
            if msg["type"] in ("execute_result", "execute_error"):
                break

asyncio.run(main())
```

### Frontend stub mode

```bash
VITE_IPC_TRANSPORT=stub pnpm --filter @gensim/frontend dev
```

The stub kernel responds with canned data — no Python process needed.
Useful for UI-only work.

### Running a single Playwright test

```bash
npx playwright test tests/e2e/smoke.spec.ts --project=chromium --headed
```

Add `--debug` for Playwright inspector.

---

## 15. Common pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Float coordinate in model | Serialiser throws `TypeError` | Use `Math.round()` before writing position |
| Mutating React Flow state directly | Canvas desyncs from graph store silently | Always go through graph-store mutations |
| Blocking the event loop in a handler | Simulate cancel never arrives | Use `asyncio.create_task` for long-running work |
| Adding `type: ignore` for `import-untyped` with `--ignore-missing-imports` | Immediate "unused type: ignore" mypy error | The flag already silences import errors; remove the comment |
| `json.load()` as `→ dict` | `no-any-return` error | Assign to explicit `result: dict[str, Any]` first |
| Missing None guard after `payload.get(key)` in a background task | `Any | None` passed where concrete type expected | Add a local None guard even if the outer function checked it |
| `pnpm vitest run` vs `npx vitest run` | `pnpm vitest` goes through `pnpm exec` → same thing; `npx vitest` works directly | Both work; `npx` is in the project allowlist |
| Renaming a block type identifier | All saved `.gsim` files are silently broken | Treat block `type` strings as a public, append-only API |
| Adding a chord without updating `keyboard-map.md` | FE-07 drift check fails CI | Edit markdown first, then code |
