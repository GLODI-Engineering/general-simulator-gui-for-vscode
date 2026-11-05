# User guide — general-simulator

This guide is for day-to-day users of the editor.

It covers:
- how the software works (mental model + workflow),
- how to build and simulate a model,
- all keyboard shortcuts currently defined for v1.

> Canonical shortcut source remains `docs/specs/keyboard-map.md`.
> If this guide and the spec ever disagree, the spec wins.

---

## 1) How the software works

`general-simulator` has one editor with two modeling styles:

1. **Signal-flow / control**
   - block diagrams (sources, math/control, routing, sinks),
   - fast simulation path (compiler + numerical backend).

2. **Physical / SPICE-style circuits**
   - electrical components and nets,
   - external SPICE solvers (ngspice/Xyce) when available.

In both cases, you use the same canvas, library, inspector, and run controls.

### Core UI regions

- **Top bar**: file actions, run controls, settings.
- **Activity bar + left sidebar**: Explorer / Search / Library / Problems.
- **Canvas**: model authoring surface.
- **Right sidebar (Inspector)**: selected block parameters.
- **Bottom panel**: waveform, workspace, output, problems.

### Data flow when you click Run

1. Model from canvas is serialized.
2. Payload is sent to the kernel-sidecar.
3. Kernel compiles/selects backend.
4. Simulation runs and writes result artifacts.
5. Frontend reads manifest + signal slices.
6. Waveform panel renders traces.

---

## 2) Typical workflow

1. **Create/open model** (`Ctrl+N` / `Ctrl+O`).
2. **Insert blocks** (Library drag-drop, or quick insert).
3. **Wire ports** (drag port→port; wire tool supports bends/branches).
4. **Edit parameters** (single click + inspector, or block double-click panel).
5. **Transform layout** (move, rotate, flip, align manually).
6. **Set simulation settings** (analysis + solver options).
7. **Run** (`Ctrl+T`).
8. **Inspect outputs** (waveform, workspace/output tabs, problems).
9. **Save/export** (`Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+Shift+E`).

---

## 3) Shortcuts (v1)

## 3.1 File & document

| Action | Shortcut |
|---|---|
| New model | `Ctrl+N` |
| Open model | `Ctrl+O` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Close model | `Ctrl+W` |
| Print | `Ctrl+P` |
| Switch editor tab | `Ctrl+Shift+Tab` |

## 3.2 Clipboard & history

| Action | Shortcut |
|---|---|
| Cut | `Ctrl+X` |
| Copy | `Ctrl+C` |
| Paste | `Ctrl+V` |
| Delete selection | `Delete` / `Backspace` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` / `Ctrl+Shift+Z` |

## 3.3 Selection & movement

| Action | Shortcut |
|---|---|
| Select all (canvas) | `Ctrl+A` |
| Clear selection | `Ctrl+Alt+A` |
| Toggle move/select mode | `M` |
| Nudge by 1 grid step | `Arrow` |
| Nudge by 10 grid steps | `Shift+Arrow` |
| Move cursor to nearest element | `Ctrl+Shift+Arrow` |
| Select top-left element | `Ctrl+Home` |
| Select bottom-right element | `Ctrl+End` |
| Select leftmost element | `Home` |
| Select rightmost element | `End` |
| Extend selection to adjacent | `Shift+Arrow` |
| Constrain drag axis (during drag) | hold `Space` |

## 3.4 Pan & zoom

| Action | Shortcut |
|---|---|
| Fit diagram | `Space` |
| Fit selection | `Space` then `F` |
| Zoom 100% | `Ctrl+0` (aliases: `Space+0`, `Alt+1`) |
| Zoom in | `Ctrl++` (alias: `Space++`) |
| Zoom out | `Ctrl+-` (alias: `Space+-`) |
| Pan by page | `Shift+Space` then `Arrow` |
| Wheel zoom | `Ctrl+MouseWheel` |
| Wheel pan vertical | `MouseWheel` |
| Wheel pan horizontal | `Shift+MouseWheel` |

## 3.5 Hierarchy navigation

| Action | Shortcut |
|---|---|
| Enter selected subsystem | `Enter` (or block double-click) |
| Leave to parent | `Esc` |
| Navigation back | `Ctrl+[` |
| Navigation forward | `Ctrl+]` |
| Look under mask | `Ctrl+U` |
| Parent library of linked block | `Ctrl+L` |
| Open model explorer | `Ctrl+H` |

## 3.6 Insert/edit

| Action | Shortcut |
|---|---|
| Open library browser | `Ctrl+Shift+L` |
| Command palette | `Ctrl+.` |
| Quick insert | double-tap `Ctrl+.` |
| Quick insert (AZERTY alias) | double-tap `Ctrl+Shift+.` |
| Toggle inspector | `Ctrl+Shift+I` / `F8` |
| Focus main parameter | `Alt+Enter` |
| Rename selected | `F2` |
| Find | `Ctrl+F` |

## 3.7 Wiring

| Action | Shortcut |
|---|---|
| Connect selected blocks | `Ctrl+Click` |
| Multi-port chained connect | `Shift+Click` |
| Tap existing line | `Ctrl+Drag` |
| Disconnect drag | `Shift+Drag` |
| Disconnect by keyboard | `Shift+Arrow` |
| Comment out blocks | `Ctrl+Shift+Y` |
| Toggle comment | `Ctrl+Shift+X` |

## 3.8 Transforms

| Action | Shortcut |
|---|---|
| Rotate clockwise | `Ctrl+R` |
| Rotate counter-clockwise | `Ctrl+Shift+R` |
| Flip | `Ctrl+I` |
| Group into subsystem | `Ctrl+G` |
| Auto-arrange | `Ctrl+Shift+A` |
| Hide block | `Ctrl+M` |

## 3.9 Validation & simulation

| Action | Shortcut |
|---|---|
| Update diagram (validate) | `Ctrl+D` |
| Start simulation | `Ctrl+T` / `F5` |
| Stop simulation | `Ctrl+Shift+T` |
| Open configuration parameters | `Ctrl+E` |
| Build for code generation | `Ctrl+B` |
| Refresh model references | `Ctrl+K` |

## 3.10 Debug stepping (paused sim)

| Action | Shortcut |
|---|---|
| Step over | `F10` |
| Step in | `F11` |
| Step out | `Shift+F11` |

## 3.11 Shell focus shortcuts

| Action | Shortcut |
|---|---|
| Toggle primary sidebar | `F6` |
| Toggle bottom panel | `F7` |
| Toggle secondary sidebar | `F8` |
| Focus activity 1/2/3/4 | `Ctrl+Shift+1/2/3/4` |
| Focus bottom tab 1/2/3/4 | `Ctrl+Shift+5/6/7/8` |

---

## 4) Notes and caveats

- Single `Ctrl+.` opens command palette; **double-tap** opens quick insert.
- Most canvas operations are undoable/redoable.
- Running SPICE workflows requires external solver binaries when not using the internal path.
- If a shortcut appears non-responsive, check context (selection/canvas/modal).

---

## 5) Where to go next

- Keyboard spec (authoritative): `docs/specs/keyboard-map.md`
- Frontend behavior spec: `docs/specs/frontend-spec.md`
- Main project overview: `README.md`
