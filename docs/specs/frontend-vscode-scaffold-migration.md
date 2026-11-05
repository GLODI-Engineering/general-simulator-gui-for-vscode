> **OBSOLETE — superseded 2026-09-04 by the VS Code extension migration.**
>
> This document describes a *cosmetic* initiative: making the standalone Tauri
> app's own chrome (title bar, activity bar, sidebars, status bar) *visually
> resemble* VS Code. It has nothing to do with running inside VS Code.
>
> That chrome is now removed. `general-simulator-gui` ships as a **real VS Code
> extension** (`apps/vscode-extension/`), where VS Code itself supplies the
> title bar, activity bar, sidebars and status bar, and the schematic canvas is
> hosted in a Custom Editor for `.gsim_sch` files.
>
> Removed as part of that work: `shell/{TopBar,ActivityBar,StatusBar,
> PrimarySideBar,SecondarySideBar,EditorArea}.tsx`, the `useUiStore().migration`
> switches described below, all 17 `*.vscode-style` / `*.vscode-surface` /
> `*.scaffold` placeholder test files (every one was `it.todo` only),
> `workspace/CodeEditor.tsx`, and the `general-simulator-frontend-vscode-style/`
> wireframe scaffold this document maps from (deleted; recoverable from git
> history at commit `268f1c7`).
>
> Retained as a historical record of a real past decision. **Do not treat
> anything below as current.**

# Frontend VS Code-style scaffold migration

This document maps the wireframe scaffold at
`general-simulator-frontend-vscode-style/` to production modules in
`apps/frontend/src/`.

## Scope

The migration is surface-by-surface and guarded by feature switches in
`useUiStore().migration`:

- `shellChrome`
- `librarySurface`
- `canvasSurface`
- `workspaceSurface`
- `waveformSurface`

Default is all `true` as of FE-73 (scaffold-first startup). Switches remain in
place as emergency rollback controls.

## Rollout status (2026-05-26)

- FE-67..FE-73: scaffold surfaces implemented and default-enabled.
- FE-74: accessibility and keyboard focus hardening completed.
- FE-75: dark-theme token wiring completed.
- FE-76: performance instrumentation bridge + e2e perf guard scaffold completed.
- FE-77: migration diagnostics and rollback telemetry hooks completed.
- FE-78: this documentation + operator runbook completed.
- FE-79: final CI stabilization gate pending.

## Parity mapping

| Scaffold reference | Production target | Notes |
|---|---|---|
| `wf-shell.jsx` | `shell/TopBar.tsx`, `shell/ActivityBar.tsx`, `shell/StatusBar.tsx`, `shell/layout.css` | Menu/title/activity/status chrome parity |
| `wf-library.jsx` | `library/LibraryActivity.tsx`, `shell/PrimarySideBar.tsx`, `shell/SecondarySideBar.tsx` | Sidebar framing + library browse affordances |
| `wf-canvas.jsx` | `canvas/Canvas.tsx`, `canvas/CanvasOverlay.tsx`, `shell/EditorArea.tsx` | Canvas surface and tool placement only; graph semantics unchanged |
| `wf-workspace.jsx` | `workspace/WorkspaceTab.tsx`, `workspace/CodeEditor.tsx`, `workspace/Console.tsx`, `workspace/VariableList.tsx` | Split-pane workspace framing |
| `wf-waveform.jsx` | `waveform/WaveformTab.tsx`, `waveform/SignalLegend.tsx` | Plot/legend/measurement framing |

## Routing contract

`App.tsx` must select shell/library/canvas/workspace/waveform surfaces from the
migration switches without reloading the app.

- With all switches `false`, all surfaces use the legacy layout.
- With only `shellChrome=true`, only title/activity/status chrome changes.
- Surface switches are independent and can be toggled in any combination.

## Rollback controls

Migration switches are persisted in local storage under the UI store migration
key. For emergency rollback, disable one or more surfaces through store state
(or clear persisted migration state).

Recommended rollback order for incident triage:

1. `waveformSurface=false`
2. `workspaceSurface=false`
3. `canvasSurface=false`
4. `librarySurface=false`
5. `shellChrome=false`

This order preserves core shell visibility while reducing scaffold complexity in
high-risk surfaces first.

## Operator runbook

### Quick health checks

1. App boot shows scaffold shell (top bar/activity/status bar styling).
2. Library activity opens and can insert a block.
3. Canvas supports pan/zoom and block drag without visual freezing.
4. Workspace tab opens and REPL/editor panes render.
5. Waveform tab opens, legend toggles, and measurement strip updates.
6. Theme toggle (`view.toggle-theme`) flips light/dark without resetting model.

### Common regressions and first response

- **Missing focus ring / keyboard trap**
  - Verify `:focus-visible` styles are present in `apps/frontend/src/shell/layout.css`.
  - Confirm interactive controls retain `aria-label` and tab focusability.
- **Surface-specific visual break**
  - Disable only the affected migration switch to keep the rest of scaffold on.
  - Capture screenshot + switch state snapshot for triage.
- **Perceived performance drop**
  - Use `window.__gensim_perf` metrics (`fixtureLoadMs`, `lastRunMs`) after fixture load/run.
  - Compare against FE-76 perf guard thresholds.
- **Unexpected rollback behavior**
  - Inspect diagnostics buffer in toast store (`useToastStore().diagnostics`) for
    `scaffold-startup` and `migration-switch-changed` events.

### Escalation data to capture

When filing a scaffold incident, include:

- Active migration switch values.
- Theme (`light`/`dark`) and browser/desktop context.
- `__gensim_perf` metrics (if perf-related).
- Last 10 diagnostic events from toast store diagnostics buffer.
- Reproduction steps and whether issue reproduces with one surface toggled off.

## Known limitations

- Scaffold performance e2e checks are currently scaffolded with planned assertions;
  FE-79 wires the final release gate.
- Existing frontend unit tests still emit React `act(...)` warnings in some suites;
  warnings are known and non-blocking for migration epics.

## Non-goals

- No change to model schema or simulation semantics.
- No change to optimistic-canvas async contract.
- No change to existing IPC transport contracts.
