# Agent orientation — where to look in `general-simulator`

> **You just got assigned an epic. Read this first.**

This project has multiple specs, two `progress.*.yaml` epic plans,
research notes on competing tools, cross-language schemas, and skill
files for recurring workflows. The set is intentional — no single
document tries to do everything. This file tells you **which doc
owns which question** so you don't read the wrong one for an hour.

It is a navigation guide. It does not restate the specs. When this
guide and a spec disagree, the spec wins; file a PR to fix this
guide in the same commit.

---

## 1. The 60-second briefing

`general-simulator` is a multi-level power-electronics and
control-system simulator. Vision: bridge SPICE-class circuits and
Simulink-class block diagrams, with **downward synthesis** (block →
op-amp circuit, block → C code) as the marquee feature. v1 ships the
control-block tier first.

Three deployment targets share one codebase:

| Target | Frontend | Backend |
|---|---|---|
| Desktop (Tauri) | React app inside WebView | Python sidecar process |
| Web — free tier | Same React app | Pyodide (future) |
| Web — paid tier | Same React app | Cloud kernel (future) |

The frontend is **context-unaware** — it sees a WebSocket URL; the
URL resolves differently per target. See
[`docs/specs/simulator-architecture-spec.md`](../specs/simulator-architecture-spec.md)
§9.

---

## 2. Authority order (cheat sheet)

The same order as [`AGENTS.md`](../../AGENTS.md), restated for
discoverability:

1. **Mechanical gates** — pre-commit hooks, CI, type checkers,
   schema validators. Never bypass; fix the cause.
2. **Skills** at `docs/agent-rules/skills/<name>/SKILL.md`. Invoke
   when starting a recurring workflow.
3. **`AGENTS.md`** — invariants that cannot be mechanized.
4. **Architecture docs** — `docs/specs/`, `docs/agent-rules/`.

If you are fighting a gate, the gate is probably right.

---

## 3. Reading order by task type

Pick the row that matches your assignment.

### 3.1 You are implementing a frontend epic

1. [`AGENTS.md`](../../AGENTS.md) — invariants.
2. Find your epic in
   [`progress.frontend.yaml`](../../progress.frontend.yaml). Note
   its `area:` field — this tells you which section of the
   frontend-spec is canonical.
3. [`docs/specs/frontend-spec.md`](../specs/frontend-spec.md) §
   matching your `area` (see §5 of this guide for the area → section
   map).
4. [`docs/specs/keyboard-map.md`](../specs/keyboard-map.md) if your
   epic registers chords or contexts.
5. The schema your epic touches (typically
   [`packages/schemas/definitions/model/gsim.schema.json`](../../packages/schemas/definitions/model/gsim.schema.json)
   or
   [`packages/schemas/definitions/blocks/block-metadata.schema.json`](../../packages/schemas/definitions/blocks/block-metadata.schema.json)).

### 3.2 You are implementing a backend epic

1. [`AGENTS.md`](../../AGENTS.md).
2. Find your epic in
   [`progress.backend.yaml`](../../progress.backend.yaml).
3. [`docs/specs/backend-spec.md`](../specs/backend-spec.md) § matching
   your `area`.
4. [`docs/specs/frontend-spec.md`](../specs/frontend-spec.md) §15
   (IPC layer) if your epic touches the message envelope.
5. [`docs/specs/pipeline_IR_design.md`](../specs/pipeline_IR_design.md)
   if your epic touches IR-1, IR-2, or lowering.
6. The block metadata + equations.py contract (BE-10, BE-11) if
   you're editing equation templates.

### 3.3 You are writing tests (tester-agent)

Same reading order as your sibling implementation track, plus:

- Use the **`/test-and-progress`** skill when the assignment includes both
  running tests and updating `progress.frontend.yaml` or
  `progress.backend.yaml` with the current outcome.

- Read the **`implementation.acceptance`** list of your epic. Those
  are the behaviors you must cover.
- Read the **`tests.acceptance`** list of your epic. Those are the
  scenarios you must *write*. Treat the list as a checklist, not a
  ceiling.
- If the implementation diverges from the spec, file an issue
  before writing the test. Tests against drifted code freeze the
  drift.

### 3.4 You are studying an OSS tool (research output)

1. [`AGENTS.md`](../../AGENTS.md) — note the GPL firewall.
2. [`docs/specs/simulink_oss_gui_analysis.md`](../specs/simulink_oss_gui_analysis.md)
   — the 10 problem categories. Every extraction must map back to
   one or more of these.

### 3.5 You are adding a new block

1. Use the **`/new-block`** skill — see
   [`docs/agent-rules/skills/new-block/SKILL.md`](./skills/new-block/SKILL.md).
   It scaffolds the directory, the YAML, the equation template, the
   test stubs, and the frontend registration in one shot.
2. If you're hand-editing instead:
   [`packages/schemas/definitions/blocks/README.md`](../../packages/schemas/definitions/blocks/README.md)
   is the spec; the schema is at
   [`packages/schemas/definitions/blocks/block-metadata.schema.json`](../../packages/schemas/definitions/blocks/block-metadata.schema.json).

### 3.6 You are changing a schema

Schemas are the cross-language contract. Drift here breaks the
build silently. Sequence:

1. Edit the JSON Schema source in
   `packages/schemas/definitions/<group>/`.
2. Run `pnpm -F @gensim/schemas codegen` to regenerate the
   TypeScript types and Python Pydantic models.
3. Update every fixture under `tests/schemas/` (or the relevant
   test dir) — old fixtures will fail.
4. Update any spec section that quotes the schema.
5. CI's drift check fails on uncommitted generated files; commit
   them in the same PR.

### 3.7 You are touching a keyboard chord

Sequence:

1. Edit
   [`docs/specs/keyboard-map.md`](../specs/keyboard-map.md) — that
   file is the source of truth.
2. Edit
   `apps/frontend/src/canvas/keymap.ts` to match.
3. The drift CI check (FE-07) will flag any mismatch. Both edits
   must land together.

---

## 4. Document map — who owns what

### 4.1 Top of tree

| File | Owns | Type |
|---|---|---|
| [`AGENTS.md`](../../AGENTS.md) | invariants, layout, commit rules, skill index | authority |
| [`CLAUDE.md`](../../CLAUDE.md) | Claude-Code-specific addenda only | tool-specific |

### 4.2 Specs (`docs/specs/`)

| File | Owns |
|---|---|
| [`simulator-architecture-spec.md`](../specs/simulator-architecture-spec.md) | Big-picture architecture: stack choices, contexts (desktop/web), the IPC contract at the top level, HDF5/LOD story, compute architecture. Strategic level. |
| [`frontend-spec.md`](../specs/frontend-spec.md) | Everything inside `apps/frontend/`: canvas, store, routing, library, inspector, registries, file persistence, layout shell. Implementation level. |
| [`backend-spec.md`](../specs/backend-spec.md) | Everything inside `apps/kernel-sidecar/` and `packages/simulator/`: process model, IPC server, kernel namespace, simulation pipeline, solver protocol, Xyce plug-in point, path discovery. Implementation level. |
| [`keyboard-map.md`](../specs/keyboard-map.md) | Every keyboard chord, the context in which it fires, and the source (Simulink-aligned or "ours" with rationale). The binding registry in `keymap.ts` derives from this file. |
| [`pipeline_IR_design.md`](../specs/pipeline_IR_design.md) | IR-1 (topology graph) and IR-2 (flat equation system) design; component-library policy; legacy-code interfacing (C/Python external blocks). |
| [`adaptive_simulation_backend_idea.md`](../specs/adaptive_simulation_backend_idea.md) | Solver roadmap: PWL custom engine, SPICE-class via EEspice/ngspice, Xyce for HPC. Auto-detection cascade. Strategic. |
| [`simulator_concept.md`](../specs/simulator_concept.md) | Product vision: multi-level abstraction, downward synthesis, the QSPICE-driven market hypothesis. Strategic. |
| [`simulink_oss_gui_analysis.md`](../specs/simulink_oss_gui_analysis.md) | The 10 problem categories every research note maps back to. Reference. |
| [`dae_ode_coupling_hybrid_simulation.md`](../specs/dae_ode_coupling_hybrid_simulation.md) | Mathematical background: how the physical DAE layer couples to the control ODE layer. Reference. |

### 4.3 Progress plans

| File | Owns |
|---|---|
| [`progress.frontend.yaml`](../../progress.frontend.yaml) | 43 epics covering the v1 frontend thin demo. Two agent tracks per epic (coder + tester). |
| [`progress.backend.yaml`](../../progress.backend.yaml) | 23 epics covering the v1 kernel-sidecar with scipy. Xyce is reserved as a documented plug-in point. |

### 4.4 Research notes

Clean-room behavioural notes on existing tools are kept outside the
tracked tree (gitignored). The GPL license firewall applies: no
code may be imported or near-translated into the MIT-licensed tree.

### 4.5 Schemas (`packages/schemas/definitions/`)

| File / dir | Owns |
|---|---|
| `model/gsim.schema.json` | `.gsim` file format (Block, Wire, ModelDocument). Authored by FE-01 (still TODO at the time of this writing). |
| `model/port-kind.schema.json` | The PortKind subschema — shared by the model schema and the block-metadata schema. |
| `blocks/block-metadata.schema.json` | Catalog entry contract for every block under `packages/blocks/src/blocks/**/metadata.yaml`. |
| `blocks/README.md` | Human-readable spec of the block-metadata file shape. |
| `ipc/`, `ir1/`, `ir2/` | Reserved for future schemas (`schema_version` rules, IR-2 serialization). Empty in v1. |
| `generated/typescript/` | TS types from codegen. Frontend imports these. |
| `generated/python/` | Pydantic models from codegen. Backend imports these. |

### 4.6 Agent rules (`docs/agent-rules/`)

| File | Owns |
|---|---|
| [`orientation.md`](./orientation.md) | **This file.** Where-to-look guide. |
| [`architecture-invariants.md`](./architecture-invariants.md) | Rationale for the four architectural invariants in `AGENTS.md`. |
| `skills/<name>/SKILL.md` | Recurring workflows (one per skill). |

### 4.7 Skill index

Skills are aliased into both `.claude/skills/` and (when set up)
`.opencode/commands/` by symlinks. They live at
`docs/agent-rules/skills/<name>/SKILL.md`.

| Skill | Trigger | Purpose |
|---|---|---|
| `/write-progress` | "write the progress file", "add an epic" | Author or extend a `progress.*.yaml` epic plan |
| `/implement-epic` | "implement epic X" | Coder-agent workflow: read contract, implement, run gates, mark `review` |
| `/test-and-progress` | "write the tests" (Mode A) / "run the tests" (Mode B) | Tester-agent: write test files or run them and update the progress file |
| `/fix-blocked` | "fix the blocked epic", "resolve the failures" | Coder-agent: read `blocked:` note, fix narrowly, return epic to `review` |
| `/commit` | "commit this" | Gate-checked commit: lint → typecheck → test → stage → commit |
| `/new-block` | "add a new block" | Scaffolds block dir, metadata.yaml, equations.py, tests, frontend registration |
| `/new-component` | (planned) | Same shape, but for device models in `packages/components/` |
| `/new-solver` | (planned) | Scaffolds a `SolverBackend` implementation |
| `/add-ir-field` | (planned) | Adds an IR-2 field with codegen + tests |
| `/check-architecture` | (planned) | Audits invariants against the tree |

---

## 5. Frontend `area` → spec section map

When `progress.frontend.yaml` says `area: <X>`, the canonical
section of `frontend-spec.md` is:

| `area:` | frontend-spec.md section |
|---|---|
| `schemas` | §3 (Canonical model store) — coupled to `packages/schemas/` |
| `store` | §3 |
| `shell` | §17, §18 (layout), §19 (registries) |
| `keymap` | §12 + the whole of `keyboard-map.md` |
| `canvas` | §4 + §6 (transforms) + §7 (selection) + §8 (ports) |
| `wire` | §5 (routing) |
| `library` | §9 |
| `inspector` | §10 |
| `palette` | §11 |
| `file` | §16 |
| `ipc` | §15 |
| `workspace` | §13 |
| `waveform` | §14 |
| `ci` | §20 |
| `e2e` | §21 |

## 6. Backend `area` → spec section map

| `area:` | backend-spec.md section |
|---|---|
| `sidecar` | §2 + §3 |
| `ipc` | §4 |
| `kernel` | §5 |
| `blocks` | §6 |
| `simulator` | §7 + §9 |
| `e2e` | §13 |

---

## 7. Cross-document contracts (the seams)

These are the contracts that keep two specs consistent. Editing one
side without the other is a CI failure.

### 7.1 `.gsim` file ↔ frontend ↔ backend

- Schema: `packages/schemas/definitions/model/gsim.schema.json`
- Frontend usage: `frontend-spec.md` §16 (file model), §3 (store
  shape)
- Backend usage: `backend-spec.md` §7 (compiler reads .gsim)
- Tests on both sides validate every save/load. Round-trip test:
  FE-30. Backend load test: BE-12.

### 7.2 Block metadata ↔ frontend ↔ backend ↔ block files

- Schema: `packages/schemas/definitions/blocks/block-metadata.schema.json`
- One YAML per block at `packages/blocks/src/blocks/<cat>/<name>/metadata.yaml`
- Sibling equation template at `…/equations.py`
- Frontend reads YAML for the library catalog, search, inspector,
  and rendering — `frontend-spec.md` §9.
- Backend reads YAML *and* imports `equations.py` — `backend-spec.md`
  §6.
- Cross-validation at backend load time (BE-10): `equations.py`
  `state_vars()` must match metadata `behavior.state_count`.
- Renaming a block, port, or param **breaks every saved model** —
  treat these identifiers as a public API.

### 7.3 IPC envelope ↔ frontend ↔ backend

- Source of truth: `simulator-architecture-spec.md` §6 (top level),
  refined in `frontend-spec.md` §15 (frontend client) and
  `backend-spec.md` §4 (backend server).
- Adding a message type requires edits on *both* sides in the same
  PR. The IPC types should eventually be schema-generated; until
  then, drift is caught by integration tests (BE-23 + FE-40).

### 7.4 Keyboard map ↔ canvas/keymap.ts

- Source: `docs/specs/keyboard-map.md` (authoritative).
- Implementation: `apps/frontend/src/canvas/keymap.ts`.
- Drift check: FE-07 (parses both files, compares).

### 7.5 v1 smoke fixture (the end-to-end gate)

- One fixture model is shared by FE-40 (frontend e2e) and BE-23
  (backend smoke).
- Living at `tests/backend/fixtures/models/step_pid_integrator_scope.gsim`
  (post-implementation).
- Editing the fixture requires both gates to pass; CI cross-checks
  identity.

---

## 8. Quick reference: where do I find...?

A reverse index. Phrase the question; this table tells you where
the answer lives.

| If you need to know... | Look in |
|---|---|
| What v1 ships and what's deferred | `frontend-spec.md` §1.3 + §22; `backend-spec.md` §1.2 + §14 |
| The list of all 43 frontend epics | `progress.frontend.yaml` (epic ids FE-01 .. FE-40) |
| The list of all 23 backend epics | `progress.backend.yaml` (BE-01 .. BE-23) |
| The exact list of v1 blocks (catalog v1) | `frontend-spec.md` §9.1 |
| How wires are routed (algorithm) | `frontend-spec.md` §5 |
| Snap target priority (port > wire > grid) | `frontend-spec.md` §4.3 |
| Rotation pivot policy | `frontend-spec.md` §6.2 + `keyboard-map.md` §8 |
| Port compatibility matrix | `frontend-spec.md` §8 + `port-kind.schema.json` |
| The Quick Insert palette behavior | `frontend-spec.md` §9.2 |
| Save / Open / Export semantics (desktop vs web) | `frontend-spec.md` §16.4–§16.6 |
| Auto-save cadence (web) | `frontend-spec.md` §16.5 |
| The activity bar / bottom panel layout | `frontend-spec.md` §18 |
| The Activity / BottomTab registries | `frontend-spec.md` §19 |
| Every keyboard chord | `keyboard-map.md` (sections §1–§16) |
| The JSON-RPC message envelope | `simulator-architecture-spec.md` §6, `frontend-spec.md` §15, `backend-spec.md` §4 |
| The binary frame format | `backend-spec.md` §4.3 + `frontend-spec.md` §15.2 |
| The handshake token flow | `backend-spec.md` §4.5 |
| How the Python REPL runs code | `backend-spec.md` §5 |
| Workspace snapshot rules | `backend-spec.md` §5.4 |
| How a block's equation template is loaded | `backend-spec.md` §6 + BE-10 |
| The `BlockEquations` protocol | `backend-spec.md` §6.1 |
| How IR-1 is built from .gsim | `backend-spec.md` §7.2 |
| Why we reject piecewise component models | `pipeline_IR_design.md` §4.1.2 + AGENTS.md invariant 3 |
| Solver backend selection cascade | `backend-spec.md` §9 + `adaptive_simulation_backend_idea.md` |
| Xyce path discovery | `backend-spec.md` §11 |
| Why we use IndexedDB on web (not File System Access API) | `frontend-spec.md` §16.5 |
| Why we use scipy in v1 (not Xyce) | `backend-spec.md` §1.2 |
| What we will not import from GPL OSS | AGENTS.md §1 (license firewall) |
| The 10 OSS problem categories | `simulink_oss_gui_analysis.md` |

---

## 9. Anti-patterns specific to this codebase

These are mistakes that look reasonable until you read the rationale.

| Anti-pattern | Why it's wrong | See |
|---|---|---|
| Float coordinates in a saved model | Causes Xcos-style save/load drift; bypasses the integer-coords invariant. | `frontend-spec.md` §4.2 |
| Reading a parameter via React Flow internal state | Bypasses the graph store — the single source of truth. Desyncs are silent. | `frontend-spec.md` §3 |
| Sync-awaiting the solver from a canvas handler | Violates the optimistic-canvas invariant; reintroduces the OMEdit failure mode. | AGENTS.md invariant 2 |
| Adding a piecewise component model | Breaks the smooth-models invariant; rejected at IR-1→IR-2 lowering. | AGENTS.md invariant 3 + `pipeline_IR_design.md` §4.1.2 |
| Near-translating GPL source into our tree | Violates the license firewall — MIT is incompatible with GPL ingest. | AGENTS.md §1 |
| Bypassing pre-commit hooks (`--no-verify`) | Hooks are mechanical gates; if one fails it caught a real issue. | AGENTS.md invariant 4 |
| Adding a chord without updating `keyboard-map.md` | Drift check (FE-07) fails CI; chord intent is lost. | `keyboard-map.md` §15 |
| Renaming a block / port / param identifier | Breaks every saved `.gsim` model. Treat as public API. | `packages/schemas/definitions/blocks/README.md` |
| Saving full numpy arrays in `workspace_update` | Crashes the WebSocket on large arrays; previews + binary frames exist for a reason. | `backend-spec.md` §5.4 |
| Writing tests *after* drift has happened | Tests against drifted code freeze the drift; raise an issue first. | §3.3 of this doc |
| Using a name like `core.*` for a user extension | `core.*` is reserved; registry conflict guard will throw at boot. | `frontend-spec.md` §19 |
| Routing through KLU / Epetra in new solver code | Epetra was retired from Trilinos end of 2025; Tpetra + Kokkos is the path. | AGENTS.md invariant 1 + `adaptive_simulation_backend_idea.md` |

---

## 10. How to add new content (briefly)

| Adding | What to do |
|---|---|
| A new spec section | Update the spec's TOC; cross-link from this guide's §4 and §8 as appropriate |
| A new epic | Append to `progress.frontend.yaml` or `progress.backend.yaml`; add to the right phase's `epics:` list; set `depends_on` |
| A new chord | Edit `keyboard-map.md` first; then `apps/frontend/src/canvas/keymap.ts`; let FE-07 catch drift |
| A new block | Use `/new-block`; if hand-rolled, follow `packages/schemas/definitions/blocks/README.md` |
| A new schema | See §3.6 of this guide |
| A new OSS-research note | Follow the GPL firewall rules in AGENTS.md; one topic per file, keep in gitignored `Misc/` |
| A new agent rule | Add at `docs/agent-rules/<name>.md`; link from `AGENTS.md` if it expresses an invariant |
| A new skill | Author at `docs/agent-rules/skills/<name>/SKILL.md`; update `AGENTS.md` skill table |

---

*Living document. Update whenever the doc structure changes —
otherwise fresh agents waste an hour finding where things moved.
Last update: 2026-05-16.*
