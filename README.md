# General Simulator GUI for VS Code

Schematic capture, component authoring and circuit/system simulation, inside
VS Code.

[`general-simulator`](https://github.com/GLODI-Engineering/general-simulator)
is the engine — a Rust simulator for power electronics and mixed
circuit/block-diagram systems, with no user interface. **This repository is
its GUI.** You draw a schematic in a VS Code tab, press Run, and read the
waveforms in a panel beside your code.

> **Status: pre-release.** The extension is not yet on the Marketplace. See
> [Roadmap](#roadmap) for what is still missing.

---

## Why in VS Code

Power-electronics models are not only schematics. A converter model carries
control code, measurement scripts, generated netlists, device datasheets and
notes. In a standalone CAD tool those live somewhere else; here they are
files in the same workspace, under the same version control, with the same
editor and the same language servers.

So the schematic is a VS Code custom editor for `*.gsim_sch`, the block
library is a view in the Activity Bar, waveforms are a panel, and the
simulation kernel is a child process the extension owns.

## What it does today

| Capability | Where |
| --- | --- |
| Schematic editor for `*.gsim_sch` — select / wire / label / annotate / pan tools, orthogonal auto-routing with obstacle avoidance, rotation, mirroring, undo | `apps/frontend/src/canvas/` |
| Block library (287 entries) with symbol previews and a per-simulator filter | `apps/frontend/src/library/` |
| Symbol editor — draw a custom component from primitives, place its ports, save it to the library | `apps/frontend/src/symbol-editor/` |
| Parameter inspector, including ngspice-46-sourced Level-1 device models and a raw `.MODEL` fallback for BSIM/PSP/HICUM-class compact models | `apps/frontend/src/inspector/` |
| Waveform viewer — multi-axes figures, cursors, per-signal colour, decimation, PDF export | `apps/frontend/src/waveform/` |
| Netlist preview and SPICE emission (ngspice, Xyce) | `apps/frontend/src/netlist/`, `packages/simulator/` |
| Hierarchy: subsystems, `.SUBCKT` definitions and instances, Goto/From routing | `apps/frontend/src/canvas/`, `packages/gsim-model/` |

Signal-flow and physical-electrical blocks coexist in one sheet: a control
loop can drive a converter leg in the same document.

## Architecture

```
VS Code extension host (Node)
├── KernelSidecar           spawns the Python kernel, parses KERNEL_READY
├── GsimHost                webview registry + cross-webview drag broker
├── LibraryViewProvider     WebviewView in the Activity Bar
├── SchematicEditorProvider CustomEditorProvider for *.gsim_sch
└── WaveformPanel           singleton results panel

webviews (Vite bundles from apps/frontend)
├── schematic.html   the canvas, inspector and symbol editor
├── library.html     the block library
└── waveform.html    the results viewer

kernel sidecar (Python)      compiles the document and runs the solver
```

The webviews talk to the sidecar over a loopback WebSocket. The extension
host owns the process and tells the webviews which port and token to use.

### One host, on purpose

This GUI previously tried to be a web app, a Tauri desktop app and a VS Code
extension from one codebase. It is now only an extension — see
[`AGENTS.md`](./AGENTS.md) invariant 0. The browser entry point that remains
(`apps/frontend/index.html`) is a development and Playwright harness, not a
shipped surface, and is excluded from the `.vsix`.

## Getting started (from source)

```sh
pnpm install
pnpm build                 # webviews + extension
```

Then press <kbd>F5</kbd> in VS Code to launch an Extension Development Host,
or package it:

```sh
pnpm package               # produces a .vsix
```

The Python side runs under [uv](https://docs.astral.sh/uv/):

```sh
uv sync
uv run pytest packages/ tests/
```

Solver binaries are not bundled. Point the resolution chain at your own:

```sh
export GENSIM_NGSPICE_PATH=/path/to/ngspice
export GENSIM_XYCE_PATH=/path/to/Xyce
```

## Testing

```sh
pnpm test                                     # vitest, both workspaces
pnpm typecheck
pnpm e2e                                      # Playwright, dev harness
xvfb-run -a pnpm test:extension:integration   # real VS Code via @vscode/test-electron
```

The integration suite launches an actual VS Code, loads the extension, and
asserts on state pulled out of the live webviews — activation, the custom
editor resolving a `.gsim_sch`, the bundle loading under the webview CSP,
React mounting, dirty-state and save writing bytes, the cross-webview drag
fan-out, and the kernel handshake.

Rendering quality is checked by rendering, not by assertion:

```sh
node scripts/render-schematic.mjs --doc docs/circuit_test/buck_converter/buck_converter.gsim_sch
```

## Roadmap

Honest about what is not done:

- **Rendering quality.** Schematics are readable but not yet handsome.
  Pin-lead length, label placement, refdes and value typography and
  symbol-to-grid proportion are the open work. This is tracked as a
  correctness property, not a nicety — `docs/specs/schematic-rendering-spec.md`.
- **Custom components do not persist.** The symbol editor writes into the
  in-memory catalog only; a saved symbol is lost on reload, and it carries a
  symbol but no simulation behaviour. `.gsim_sym` file I/O exists on the
  Python side (`packages/gsim-model/src/gsim_model/gsim_sym.py`) and needs
  wiring to the editor.
- **Marketplace release.** Not yet published.

## Related repositories

| Repository | What it is |
| --- | --- |
| [general-simulator](https://github.com/GLODI-Engineering/general-simulator) | The engine: LCP device resolution for piecewise-linear circuits, with native control blocks |
| [general-mna](https://github.com/GLODI-Engineering/general-mna) | Modified nodal analysis: descriptor-DAE assembly, hierarchy flattening |
| [gs-waveform-measurements](https://github.com/GLODI-Engineering/gs-waveform-measurements) | Post-simulation measurements on non-uniform time series |
| [spice-lsp](https://github.com/GLODI-Engineering/spice-lsp) | SPICE netlist parsing and language tooling |

## Licence

[AGPL-3.0-or-later](./LICENSE), matching the rest of the toolchain.
Third-party notices: [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
