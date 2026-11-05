# Agent Guidelines

You are working on **General Simulator GUI for VS Code** — the graphical
front end for [`general-simulator`](https://github.com/GLODI-Engineering/general-simulator),
which is the headless engine. This repo is the GUI, and it targets exactly
one host: **VS Code**. Full architecture: `docs/specs/`.

This file lists only what mechanical checks cannot enforce.

## Authority order

When guidance conflicts, follow this order:

1. **Mechanical gates** — pre-commit hooks, CI, type checkers, schema
   validators. If a gate fails, fix the cause; never bypass.
2. **This file** — invariants that cannot be mechanized.
3. **Architecture docs** — `docs/specs/` and `docs/agent-rules/`.

If you are fighting a gate, the gate is probably right.

## Project layout

```
apps/frontend         React/Vite webview bundles — the canvas, inspector,
                      library, waveform viewer and symbol editor
apps/vscode-extension The extension host: custom editor, views, commands,
                      kernel lifecycle
apps/kernel-sidecar   Python process the extension spawns; speaks WebSocket
packages/             Python libraries — schemas, simulator, gsim-model,
                      components, blocks, synthesis, engine-xyce, kernel-core
docs/                 specs/ (architecture), guides/, decisions/, journal/
tests/                cross-package integration, e2e, validation
```

Languages: TypeScript (pnpm workspace), Python (uv workspace). The single
source of truth for cross-language schemas is `packages/schemas/definitions/`.

## Invariant 0a — `general-simulator` is the contract

**The engine is the ground truth. The front end conforms to it, not the other
way round, and not to several backends at once.**

An earlier attempt made the front end target ngspice, Xyce and
`general-simulator` simultaneously. Three taxonomies, three sets of
parameter names and three notions of what a block *is* had to be reconciled
by hand in the UI, and the result was unmanageable. ngspice and Xyce support
comes back later, if it comes back, as a translation *from* this contract.

What that means in practice:

- `gsim-core`'s compile registry (`crates/gsim-core/src/compile/spec.rs`) is
  the authority on what a block is and what it compiles to. When the catalog
  and the registry disagree, the registry wins and the catalog is wrong.
- A block type offered in the library should be one the engine can actually
  run. **Today that is not true**: the catalog carries 265 types and the
  registry knows 59, and the two use different names — a part spelled
  `physical-electrical.source.voltage_dc` renders but only
  `source.voltage.dc` compiles. A sheet you can draw is therefore often not
  a sheet you can run, with nothing in the UI saying so. Closing that gap is
  real work and is not done.
- Parameter names come from the registry too: a DC source takes `V`, an
  inductor `L` and `IC`, an ideal switch `r_on`/`g_on`/`g_off`/`v_th`/
  `v_breakdown`/`g_breakdown`. Inventing friendlier names in the front end
  re-creates the mess this invariant exists to prevent.
- Engine rules that look like restrictions are part of the contract. A
  switch gate must be driven through a `converter.sig2phys` in the voltage
  domain; pointing it straight at a signal source fails with
  `GateTargetNotSig2Voltage`. The front end should make that shape easy, not
  paper over it.

## Invariant 0 — VS Code is the only host

This repo exists because the previous one tried to be a website, a Tauri
desktop app and a VS Code extension at once, and was good at none of them.
Do not reintroduce that.

- **No second host.** No Tauri, no Electron, no hosted web app. There is one
  deployable: the `.vsix`.
- **Do not rebuild what VS Code already is.** No in-webview file explorer,
  search panel, output console, settings dialog, title bar or tab strip. If
  VS Code has a surface for it, use VS Code's API for it: `Diagnostic` for
  problems, `OutputChannel` for logs, `TreeView` for trees, `workspace.fs`
  for files, the workbench command palette for commands.
- **`apps/frontend/index.html` + `src/main.tsx` are a dev/test harness, not
  a product surface.** They exist so the canvas can be developed with HMR
  and exercised by Playwright, which cannot drive a webview. Nothing in the
  harness may become load-bearing for the extension, and it is excluded
  from the `.vsix`.

## Architectural invariants

1. **Optimistic canvas.** `apps/frontend/src/canvas/` never synchronously
   awaits the solver/compiler/kernel. All such interaction is async.
   → `docs/agent-rules/architecture-invariants.md#optimistic-canvas`

2. **Smooth component models only.** Equation templates in
   `packages/components/` must be smooth/continuous. Piecewise models are
   rejected at IR-1 → IR-2 lowering.
   → `docs/agent-rules/architecture-invariants.md#smooth-models`

3. **The webview generates no code at runtime.** The CSP has no
   `'unsafe-eval'`, and `apps/vscode-extension/src/webview-html.test.ts`
   asserts it stays absent. A dependency that compiles code at runtime (a
   JSON-schema compiler, a templating engine, a charting library that
   compiles accessors) makes the webview render *nothing at all*, with no
   error visible outside the webview. Precompile it or replace it — see
   `apps/frontend/scripts/gen-validators.mjs` for the pattern.

4. **Tpetra, not Epetra.** Epetra was removed from Trilinos end of 2025.
   New code in `packages/engine-*/` uses Tpetra + Kokkos + Belos.

5. **No hook bypass in automation.** `scripts/` and `.github/workflows/`
   must not contain `--no-verify`, `--no-gpg-sign`, `SKIP=`, etc.

## Invariant 6 — rendering quality is a correctness property

A schematic that simulates correctly but looks like a sketch is a failed
feature. `docs/specs/schematic-rendering-spec.md` is the contract: grid
discipline, orthogonal wires, pin-exact endpoints, stroke hierarchy,
label placement, junction dots.

**You may not claim rendering work is done without looking at a render.**
Produce a PNG (`scripts/render-schematic.mjs`), open the image, and judge
it. Unit tests cannot see that two labels overlap or that a wire crosses a
symbol body.

## Commit conventions

Conventional Commits enforced by the `commit-msg` hook. Types: `feat`,
`fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
`revert`. Scope optional. `!` after type for breaking changes.

```
feat(canvas): add orthogonal wire router
fix(kernel): handle stdout chunks > 64KB
refactor!: rename IR-1 schema fields
```

## Session journal

`docs/journal/` is a chronological work log, one file per calendar month
(`docs/journal/YYYY-MM.md`), with rules and an index in
`docs/journal/README.md`. **Read the newest month file's top entry at the
start of any session that continues prior work**, and write a new entry
after every commit. It exists so a cold session can reconstruct what
happened and why without re-deriving context.

## Building and testing

```sh
pnpm install
pnpm build                     # webviews + extension
pnpm test                      # vitest, both workspaces
pnpm typecheck
pnpm e2e                       # Playwright against the dev harness
xvfb-run -a pnpm test:extension:integration   # real VS Code, @vscode/test-electron
pnpm package                   # .vsix
```

External solver binaries (ngspice / Xyce) are not bundled and are not on
`PATH`. Point the resolution chain at your own build:

```sh
export GENSIM_NGSPICE_PATH=/path/to/ngspice
export GENSIM_XYCE_PATH=/path/to/Xyce
```

Without these the two solver integration tests skip; everything else runs.

## What NOT to do

- Don't bypass pre-commit hooks with `--no-verify`. Fix the issue.
- Don't introduce abstractions without an existing call site. Three similar
  lines beats a premature abstraction.
- Don't add backwards-compatibility shims for code that has never shipped.
- Don't comment WHAT code does. Name things clearly. Comment only the
  non-obvious WHY.
- Don't claim a task complete if CI is red, or rendering work complete
  without having looked at a render.
- Don't name private repositories, or commercial tools used as internal
  references, anywhere in this repo. It is published.
