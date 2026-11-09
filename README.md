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

## Install and try it

```sh
pnpm install
pnpm package               # builds the webviews + extension, writes general-simulator-gui.vsix
code --install-extension general-simulator-gui.vsix
```

Then **open this repository as your VS Code workspace folder** and open
`examples/buck_converter.gsim_sch`. It opens in the schematic editor, with
the block library in the Activity Bar.

Opening the repo folder matters: the extension spawns a Python kernel as a
child process and finds it by looking for `pyproject.toml` in your open
workspace folders. Working in a different folder, set the path explicitly:

```jsonc
// settings.json
"generalSimulator.workspaceRoot": "/path/to/general-simulator-gui-for-vscode"
```

**Warm the Python environment before the first run**, or the first launch
sits for several minutes while uv downloads an interpreter and the
dependency set:

```sh
uv sync
uv run --project . --package kernel-sidecar python -m kernel_sidecar --port 0 --token dev --connect-timeout 0
```

That prints `KERNEL_READY port=… token=…` once it is up; Ctrl-C it, and the
extension will start its own instantly thereafter. `General Simulator: Show
Kernel Log` in the command palette shows exactly what was spawned when
something goes wrong.

Solver binaries are not bundled. ngspice and Xyce are optional — the
general-simulator engine needs neither — but to use them, point the
resolution chain at your own build:

```sh
export GENSIM_NGSPICE_PATH=/path/to/ngspice
export GENSIM_XYCE_PATH=/path/to/Xyce
```

### Developing on it

<kbd>F5</kbd> launches an Extension Development Host against the checkout.
For canvas work the browser harness is far faster, since it has HMR and can
be driven by Playwright:

```sh
pnpm dev:webviews          # http://localhost:5173
```

## Settings

Everything the extension needs to find lives under **General Simulator** in VS Code's settings
(`Ctrl+,`, then search `generalSimulator`). Every path may be left empty, in which case it is
searched for.

| Setting | What it is for |
| --- | --- |
| `generalSimulator.generalSimulatorPath` | The `general-simulator` binary — the engine that runs a simulation. Build it with `cargo build --release -p general-simulator-cli` and point here at `target/release/general-simulator`. |
| `generalSimulator.ngspicePath` | The `ngspice` binary. Only for schematics run with that solver. |
| `generalSimulator.xycePath` | The `Xyce` binary. Only for schematics run with that solver. |
| `generalSimulator.octaveCliPath` | The `octave-cli` binary, for `octfunc` / `octblock` code blocks. |
| `generalSimulator.pythonPath` | Extra directories on `PYTHONPATH`, so a `pyblock` / `pyfunc` block can import your own modules. Relative entries resolve against the workspace folder. |
| `generalSimulator.environment` | Extra environment variables for the kernel and everything it starts. The escape hatch for anything without its own setting. |
| `generalSimulator.workspaceRoot` | The Python checkout the simulation kernel starts from. Empty uses the open workspace folders. |
| `generalSimulator.pythonRunner` | Command that starts the kernel — `uv` by default. |
| `generalSimulator.autoStartKernel` | Start the kernel when the extension activates. |

### How a binary is actually found

A setting is one rung of a chain the backend already had, and not the first:

1. an explicit path on the simulate request,
2. the app settings file (`~/.local/share/general-simulator/settings.json`),
3. the environment — **this is the rung these settings write**,
4. `PATH`,
5. otherwise `SolverNotFoundError`, listing every place it looked.

So a setting overrides `PATH` and is overridden by the settings file. Setting
`generalSimulator.generalSimulatorPath` is equivalent to exporting
`GENSIM_GENERAL_SIMULATOR_PATH` before starting the editor, and you can do either.

Two of these are not quite like the others:

- **Octave** has no path setting in the engine: it spawns `octave-cli` from `PATH` and nothing
  else. So `octaveCliPath` puts that binary's directory at the front of the `PATH` the
  simulation inherits.
- **`pythonPath`** does not choose an interpreter. The engine embeds the one it was built
  against; this only adds places for a block's `import` to look.

The kernel log (`General Simulator: Show Kernel Log`) lists the variable *names* it was given
on start-up, so you can tell a setting arrived without a path appearing in a log you might
paste into an issue.

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

Rendering quality is checked by rendering and looking, not by assertion — no
test notices that two labels overlap. See
[`docs/specs/schematic-rendering-spec.md`](docs/specs/schematic-rendering-spec.md):

```sh
node scripts/render-schematic.mjs --doc examples/buck_converter.gsim_sch
```

## Roadmap

Honest about what is not done:

- **Rendering quality.** Much improved — the geometry is now grid-exact,
  terminals carry reference designators and values, pin-name clutter is gone
  and junction dots are correct. Still open: labels anchor to the symbol's
  bounding box rather than to its ink, so a value can sit further from a thin
  glyph than it should; and the dot grid competes with the drawing. Tracked
  as a correctness property, not a nicety —
  [`docs/specs/schematic-rendering-spec.md`](docs/specs/schematic-rendering-spec.md)
  and issue #1.
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
