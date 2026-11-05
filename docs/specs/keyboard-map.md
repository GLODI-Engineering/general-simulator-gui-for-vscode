# Keyboard map — `general-simulator` v1

> **Status:** authoritative. Frontend implementation MUST follow this map.
> Changes require an explicit decision in this file; do not drift.
>
> **Anchored to:** Simulink keyboard reference, MathWorks current docs
> (`summary-of-mouse-and-keyboard-actions.html`), fetched 2026-05-16.
>
> **Policy:** Simulink-aligned. Where Simulink defines a chord, we copy it
> exactly. Where Simulink leaves a chord unbound, we either leave it
> unbound or pick deliberately with a recorded rationale.
>
> **Cross-references:**
> - Why Simulink-aligned: project memory `project-keyboard-map`, and
>   [`docs/specs/simulink_oss_gui_analysis.md`](simulink_oss_gui_analysis.md) §6.

## Conventions

- All chords use the **Windows / Linux** convention. On macOS, `Cmd` (⌘)
  substitutes for `Ctrl` and `Option` substitutes for `Alt`. This is a
  display-layer concern; the binding registry stores Simulink-style names
  (`Ctrl+R`) and the OS keymap translator handles the substitution.
- Single-letter chords (`R`, `M`, `Space`, `F2`, etc.) are case-insensitive
  and modifier-less.
- `Space+X` means "hold Space, then press X" — Space acts as a chord
  leader (Simulink convention for zoom/fit family).
- "Selected" in the Context column means at least one model element is
  selected. "Editing" means inside an in-place text edit.

## 1. File & document

| Action | Chord | Context | Source |
|---|---|---|---|
| New model | `Ctrl+N` | global | Simulink |
| Open model | `Ctrl+O` | global | Simulink |
| Save all modified models | `Ctrl+S` | global | Simulink |
| Save current model only | `Ctrl+Shift+S` | global | Simulink |
| Close current model | `Ctrl+W` | global | Simulink |
| Print | `Ctrl+P` | global | Simulink |
| Switch tab | `Ctrl+Shift+Tab` | global | Simulink |

## 2. Clipboard & undo

| Action | Chord | Context | Source |
|---|---|---|---|
| Cut | `Ctrl+X` | global | Simulink |
| Copy | `Ctrl+C` | global | Simulink |
| Paste | `Ctrl+V` | global | Simulink |
| Delete selection | `Delete` / `Backspace` | selected | Simulink |
| Undo | `Ctrl+Z` | global | Simulink |
| Redo | `Ctrl+Y` (primary) / `Ctrl+Shift+Z` (alias) | global | Simulink |

## 3. Selection & movement

| Action | Chord | Context | Source |
|---|---|---|---|
| Select all | `Ctrl+A` | canvas | Simulink |
| Clear selection | `Ctrl+Alt+A` | canvas | Simulink |
| Toggle move vs select mode | `M` | global | Simulink |
| Move selection by 1 grid step | `Arrow` | selected, selection mode | Simulink |
| Move selection by 10 grid steps | `Shift+Arrow` | selected, selection mode | Simulink |
| Move cursor to nearest element | `Ctrl+Shift+Arrow` | selection mode | Simulink |
| Select top-left element | `Ctrl+Home` | canvas | Simulink |
| Select bottom-right element | `Ctrl+End` | canvas | Simulink |
| Select leftmost element | `Home` | canvas | Simulink |
| Select rightmost element | `End` | canvas | Simulink |
| Extend selection to adjacent | `Shift+Arrow` | selection mode | Simulink |
| Constrain drag to H/V axis | `Space` (hold) | during drag | Simulink |

## 4. Pan & zoom

| Action | Chord | Context | Source |
|---|---|---|---|
| Fit diagram to window | `Space` | canvas | Simulink |
| Fit selection to window | `Space+F` | selected | Simulink |
| Zoom to 100 % | `Ctrl+0` (primary), `Space+0` / `Alt+1` (aliases) | canvas | Simulink |
| Zoom in | `Ctrl++`, `Space++` | canvas | Simulink |
| Zoom out | `Ctrl+-`, `Space+-` | canvas | Simulink |
| Zoom with wheel | `Ctrl+ScrollWheel` | canvas | Simulink |
| Pan vertically with wheel | `ScrollWheel` (default) | canvas | Simulink |
| Pan horizontally with wheel | `Shift+ScrollWheel` | canvas | Simulink |
| Pan by page | `Shift+Space+Arrow` | canvas | Simulink |

## 5. Hierarchy navigation

| Action | Chord | Context | Source |
|---|---|---|---|
| Enter selected subsystem / referenced model | `Enter` (primary) / double-click | selected composite block | Simulink |
| Leave to parent (one level) | `Esc` | inside subsystem | Simulink |
| Navigation history: back | `Ctrl+[` | global | Simulink |
| Navigation history: forward | `Ctrl+]` | global | Simulink |
| Look under block mask | `Ctrl+U` | masked block selected | Simulink |
| Go to parent library of linked block | `Ctrl+L` | linked block selected | Simulink |
| Open Model Explorer | `Ctrl+H` | global | Simulink |

Breadcrumb is a **visible UI element**, always shown when hierarchy depth
> 0. Clicking a breadcrumb segment is equivalent to repeated `Esc`.

## 6. Adding & editing elements

| Action | Chord | Context | Source |
|---|---|---|---|
| Open Library Browser | `Ctrl+Shift+L` | global | Simulink |
| Quick Insert block search | `Ctrl+.` (pressed twice) | canvas | Simulink |
| Quick Insert (AZERTY alias) | `Ctrl+Shift+.` (pressed twice) | canvas | Simulink |
| Open/hide Property Inspector | `Ctrl+Shift+I` | global | Simulink |
| Set main parameter of selected block | `Alt+Enter` | block selected | Simulink |
| Rename selected element | `F2` (primary) / double-click on label | selected | Simulink |
| Find string | `Ctrl+F` | global | Simulink |

> **Quick Insert is non-negotiable.** This is the single biggest UX win
> per [`simulink_oss_gui_analysis.md`](simulink_oss_gui_analysis.md) §6.

## 7. Connecting elements

| Action | Chord | Context | Source |
|---|---|---|---|
| Connect two selected blocks | `Ctrl+Click` (on the second block) | block selected | Simulink |
| Multi-port chained connect | `Shift+Click` | port-to-port flow | Simulink |
| Tap into existing signal line | `Ctrl+Drag` | signal line selected | Simulink |
| Disconnect block from neighbour | `Shift+Drag` (block) | connected block | Simulink |
| Disconnect block by keyboard | `Shift+Arrow` | selected, selection mode | Simulink |
| Comment out blocks (keep signals) | `Ctrl+Shift+Y` | blocks selected | Simulink |
| Toggle comment | `Ctrl+Shift+X` | blocks selected | Simulink |

> **No dedicated "wire-mode" chord.** Wire creation is port-to-port drag,
> matching Simulink. This is a deliberate departure from Qucs (`Ctrl+E`)
> and KiCad (`W`) — see [§14 Migration cost](#14-migration-cost-for-qucs-and-kicad-users).

## 8. Formatting / transforms

| Action | Chord | Context | Source |
|---|---|---|---|
| Rotate clockwise (90°) | `Ctrl+R` | block(s) selected | Simulink |
| Rotate counter-clockwise (90°) | `Ctrl+Shift+R` | block(s) selected | Simulink |
| Flip block | `Ctrl+I` | block(s) selected | Simulink |
| Group selection into subsystem | `Ctrl+G` | selected | Simulink |
| Auto-arrange model | `Ctrl+Shift+A` | canvas | Simulink |
| Hide block | `Ctrl+M` | block selected | Simulink |
| Resize from centre | `Ctrl+Drag` (handle) | resizing | Simulink |
| Resize preserving aspect ratio | `Shift+Drag` (handle) | resizing | Simulink |

**Rotation pivot policy** (resolves the open question from the Qucs and KiCad research):
- Single block: rotate around the block's own anchor.
- Multi-selection: rotate around the selection bounding-box centre,
  snapped to grid.
- Mirroring axis policy follows the same rule.

This is closer to KiCad's "connectable item uses its own anchor" model
than Qucs's "always bounding-box centre", and is the better default for a
block-diagram editor where users typically rotate one block at a time.

## 9. Validation & simulation

| Action | Chord | Context | Source |
|---|---|---|---|
| Update diagram (inline validation, no run) | `Ctrl+D` | global | Simulink |
| Start simulation | `Ctrl+T` (primary), `F5` (alias) | global | Simulink |
| Stop simulation | `Ctrl+Shift+T` | simulation running | Simulink |
| Open Configuration Parameters dialog | `Ctrl+E` | global | Simulink |
| Build for code generation | `Ctrl+B` | global | Simulink |
| Refresh Model-reference blocks | `Ctrl+K` | global | Simulink |

> **`Ctrl+D` runs validation, not "deactivate".** Qucs's `Ctrl+D`
> (toggle-deactivate) and Simulink's `Ctrl+D` (Update Diagram) are the
> same chord with different meaning. We follow Simulink — Qucs migrators
> will need to relearn.

## 10. Debugging (when simulation paused)

| Action | Chord | Context | Source |
|---|---|---|---|
| Step over | `F10` | sim paused | Simulink |
| Step in | `F11` | sim paused | Simulink |
| Step out | `Shift+F11` | sim paused | Simulink |

## 11. Generic action search

| Action | Chord | Context | Source |
|---|---|---|---|
| Open generic action search | `Ctrl+.` (single press) | canvas | Simulink |
| AZERTY alias | `Ctrl+Shift+.` | canvas | Simulink |

This is the **command palette**. Type any action name and it surfaces in
a ranked, fuzzy-matched list. It is the keyboard route to any command
that has no dedicated chord. **Pressing `Ctrl+.` twice** elevates the
same palette into block-insert mode (see §6).

## 12. Mouse-only gestures (for completeness)

Not bindings per se, but settled here so the canvas implementation knows
what to support:

| Gesture | Action | Source |
|---|---|---|
| Double-click on subsystem | Enter hierarchy (alias for `Enter`) | Simulink |
| Double-click on block label | Begin rename | Simulink |
| Double-click on background | Open Quick Insert at cursor | Simulink (canvas double-click) |
| Drag from port | Begin wire from that port | Simulink |
| Drag wire end onto port | Complete connection | Simulink |
| Click on breadcrumb segment | Navigate to that level | (ours — UI element, not a Simulink chord) |
| Right-click on canvas | Context menu | (ours) |
| Right-click on block | Block context menu | (ours) |

## 13. Bindings we deliberately leave **unbound**

Free for users to customise; default is no action.

| Chord | Why unbound | Common OSS use |
|---|---|---|
| `R` | Single-letter rotate would conflict with future Simulink additions. Use `Ctrl+R`. | KiCad: rotate CCW |
| `W` | Single-letter wire-mode rejected; we use port-drag. | KiCad: draw wire |
| `A` | Single-letter "add" rejected; Quick Insert (`Ctrl+.` twice) is the path. | KiCad: place symbol |
| `E` | Single-letter properties rejected; `Alt+Enter` is the Simulink path. Note `Ctrl+E` is taken (Config Parameters). | KiCad: properties |
| `P` | Reserved for future "place power port" or similar; default unbound. | KiCad: place power |
| `B` | Reserved for future "bus" tooling; default unbound. | KiCad: draw bus |
| `X`, `Y`, `J`, `L`, `H`, `Q` | Free; KiCad uses them as primary verbs. Leaving them free keeps the door open for future bindings without breaking existing Simulink chords. | KiCad: mirror/junction/label/etc. |

## 14. Migration cost for Qucs and KiCad users

These rows summarise *every* chord whose meaning differs between Qucs /
KiCad and our Simulink-aligned binding. Surface this table in the future
"Migrating from Qucs / KiCad" doc.

| Chord | Qucs meaning | KiCad meaning | Our meaning (Simulink) | Severity |
|---|---|---|---|---|
| `Ctrl+R` | rotate 90° CCW | — | **rotate 90° CW** | high — same chord, opposite direction (Qucs) |
| `Shift+R` | — | rotate 90° CW | unbound | medium — KiCad muscle memory broken |
| `R` | — | rotate 90° CCW | unbound | medium |
| `Ctrl+L` | place wire/pin label | place global label | **go to parent library of linked block** | high — semantic collision both directions |
| `Ctrl+E` | wire-drawing mode | — | **open Configuration Parameters** | high (Qucs) |
| `Ctrl+I` | enter subcircuit | — | **flip block** | high (Qucs) |
| `Ctrl+H` | leave subcircuit | open hierarchy navigator | **open Model Explorer** | medium — Simulink and KiCad align; Qucs collides |
| `Ctrl+G` | insert ground | — | **group into subsystem** | medium (Qucs) |
| `Ctrl+D` | toggle deactivate selection | — | **Update Diagram (inline validation)** | high (Qucs) |
| `F2` | start simulation | — | **rename selected element** | high (Qucs) |
| `Ctrl+J` / `Ctrl+M` | mirror X / Y | — | `Ctrl+M` is **hide block**; mirror is `Ctrl+I` | medium (Qucs) |
| `W` | — | draw wire | unbound (port-drag instead) | low — KiCad |
| `A` | — | place symbol | unbound (use Quick Insert) | medium — KiCad |
| `Alt+Backspace` | — | leave parent sheet | unbound (use `Esc`) | low — KiCad |
| `Alt+Left/Right` | — | hierarchy history back/forward | unbound (use `Ctrl+[`/`Ctrl+]`) | low — KiCad |

## 15. Implementation notes

- The binding registry lives in `apps/frontend/src/canvas/keymap.ts`.
  Each entry has `{ id, chord, contexts, action }` shape. The list in
  this file is the source of truth; the registry must be a faithful
  encoding.
- **User customisation:** v1 ships the map above as default. A user
  override file (`~/.config/general-simulator/keymap.json`) can rebind
  any action, but the **action IDs** are stable across releases.
- **Context dispatch:** a chord can be bound differently in different
  contexts (e.g. `Arrow` moves selection in canvas, navigates list in
  Library Browser). The registry dispatches on the active focus element.
- **Conflict guard:** the registry refuses to start if two actions claim
  the same `(chord, context)` pair. Catches accidental drift.

## 16. What's out of scope (v1)

- **Stateflow / chart editor shortcuts.** Out of scope until we have a
  Stateflow analogue.
- **macOS-specific debug shortcuts** (`Shift+Cmd+O/I/U` for step-over/in/out).
  Defer until macOS build is a release target.
- **Mouse customisation.** Mouse gestures are hard-coded in v1.

---

*Decision record. Bindings here are the authoritative reference; the
frontend spec and the keymap registry both derive from this file.*
