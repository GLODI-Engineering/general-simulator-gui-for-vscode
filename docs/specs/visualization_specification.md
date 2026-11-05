# Visualization Specification — Simulation Data Viewer

**Version:** 1.0  
**Date:** 2026-06-01  
**Status:** Approved — ready for implementation

---

## 1. Overview

The Simulation Data Viewer is a post-simulation and live-streaming waveform environment integrated into the app as a set of tabs under the existing **Waveform** tab. It allows users to inspect, measure, and export simulation results from any open `.gsim` file for which simulation data exists.

The viewer has three logical layers:

| Layer | Responsibility |
|---|---|
| Signal Browser | Lists open simulation files and their available signals |
| Figure Manager | Creates and arranges figures (collections of axes) |
| Axes Renderer | Renders signals, manages zoom/pan, measurements, and export |

---

## 2. Signal Browser Panel

### 2.1 Content

The panel displays a tree of every currently open simulation file that has at least one completed (or in-progress) simulation run with data on disk. Under each file entry, all available signals are listed with their name, physical dimension, and unit (e.g., `V(out)  Voltage  V`).

### 2.2 Signal Assignment — Three Entry Points

| Entry point | Gesture | Behaviour |
|---|---|---|
| Drag | Drag a signal from the browser onto an axis | Signal is added to the target axis immediately |
| Right-click | Right-click a signal → "Add to axis…" | Sub-menu lists all figures and their axes |
| Probe double-click | Double-click a voltage/current/temperature probe on the schematic canvas | Modal dialog (§4.1) opens to choose figure + axis |

### 2.3 Signal Cap per Axis

There is no hard cap. When more than **10 signals** are on a single axis a non-blocking warning banner appears. The user may dismiss it and continue.

### 2.4 Auto-create on First Assignment

If no figures exist when a signal is dropped onto the canvas or a probe is double-clicked, the app silently creates a default `1 × 1` figure named `Figure 1` and places the signal on its single axis.

---

## 3. Figure

### 3.1 Definition

A **Figure** is the fundamental unit of visualization. Each figure has:

- A unique string identifier (e.g., `fig-1`, `fig-bode`)
- A user-editable display name
- A subplot grid of **R rows × C columns** chosen at creation time (editable later)
- A flat list of **Axes** (one per grid cell; see §5)

### 3.2 Lifecycle

| Action | Trigger | Result |
|---|---|---|
| Create | "New Figure" button or auto-create | Blank figure with 1 × 1 grid added as a new tab |
| Rename | Double-click on the figure tab label | Inline text edit |
| Delete | Context menu on the tab | Figure removed; no undo (irreversible) |
| Close on file close | Simulation file closed by user | All figures whose signals belong exclusively to that file are removed immediately |

### 3.3 Grid Configuration

The user sets rows and columns in a figure-settings panel (accessible via a gear icon on the figure tab). Reducing the grid discards axes that fall outside the new bounds — the app prompts for confirmation before doing so.

---

## 4. Axes

### 4.1 Probe → Axis Assignment Modal

When the user double-clicks a probe element on the schematic, a modal dialog opens containing:

- A drop-down listing all existing figures (plus "New Figure…")
- A grid thumbnail of the selected figure's axes with click-to-select
- Confirm / Cancel buttons

If "New Figure…" is chosen, a default `1 × 1` figure is created first, then the signal is placed on its single axis.

### 4.2 Axis Identifiers

Every axis has a unique identifier composed of its parent figure ID and its grid position, e.g., `fig-1.r0c1`. These identifiers are stable across rename operations.

### 4.3 Multi-unit Y Axes

When signals with different physical dimensions are plotted on the same axis, one independent Y axis spine is added per distinct dimension. Signals with no physical dimension (dimensionless) share the primary spine and add no new spine.

**Example:** Plotting `V(out)` (Voltage) and `I(R1)` (Current) on the same axis produces two Y spines — one in **V**, one in **A**.

### 4.4 Axis Modes

The axis mode is determined automatically by the backend tag on the signal data:

| Mode | Trigger | X axis | Y axis |
|---|---|---|---|
| Time-domain | Signal tagged `transient` | Time (s) | Signal amplitude |
| Bode — magnitude | Signal tagged `ac_mag` | Frequency (Hz, log) | Magnitude (dB) |
| Bode — phase | Signal tagged `ac_phase` | Frequency (Hz, log) | Phase (deg) |
| Noise | Signal tagged `noise` (domain `frequency`) | Frequency (Hz, log) | Signal's native unit (e.g. V/√Hz) |
| XY sweep | Signal tagged `dc_sweep` (domain `parameter`) | Swept parameter | Output variable |

A single axis can only operate in one mode. Mixed-mode signal drops are rejected with a tooltip error.

The x-axis label/scale is derived from each signal's `domain` field (§11), not from Bode-mode specifically: any signal with `domain: "frequency"` gets a log-scaled "Frequency (Hz)" x-axis, whether or not it's also in Bode (dB/phase) mode — this is what lets Noise share the log-frequency axis with AC signals while keeping its own real units instead of being forced into dB. `domain: "parameter"` signals get a generic "Sweep Parameter" x-axis label; everything else defaults to a "Time (s)" x-axis, whose tick labels auto-scale to ns/µs/ms/s based on the visible range so sub-microsecond transients don't all round down to "0".

---

## 5. Axis Coupling (Synchronized Zoom)

### 5.1 Coupling Groups

Users can organize axes into named **coupling groups**. All axes in the same group share their X zoom state, Y zoom state, or both (user-selectable per group).

### 5.2 Creating and Managing Groups

Two interaction paths:

1. **Named groups panel** — a sidebar panel lists all coupling groups. The user creates a group, gives it a name, and assigns axes by checkbox. An axis can belong to at most one coupling group.
2. **Drag-to-link** — dragging one axis header onto another merges them into a group (or adds to the target's existing group). A coloured badge on each axis header indicates its group membership.

### 5.3 Zoom Propagation

When the user pans or zooms an axis that belongs to a coupling group, the same transform is applied to all other axes in the group simultaneously.

---

## 6. Toolbar

Each figure has a persistent toolbar with the following controls:

| Control | Function |
|---|---|
| Zoom in / Zoom out | Fixed-ratio zoom centred on the axis midpoint |
| Zoom to fit | Fit all visible data within the axes bounds |
| Pan | Hand-drag pan mode |
| Cursor A / Cursor B | Place a vertical time cursor; both cursors define the measurement window |
| Measurement dropdown | Select a measurement to compute (see §7) |
| Measurement output | Read-only field showing the current measurement result |
| Export figure | Opens the export dialog (see §9) |

---

## 7. Measurements

### 7.1 Measurement Range

The user toggles between two modes via a button next to the measurement dropdown:

- **Full range** — measurement spans the entire signal.
- **Cursor window** — measurement spans [Cursor A, Cursor B]. Both cursors must be placed; otherwise the mode falls back to full range.

### 7.2 Time-Domain Measurements

| Measurement | Description |
|---|---|
| RMS | Root mean square of the selected signal over the window |
| Mean | Arithmetic mean |
| Frequency | Fundamental frequency (zero-crossing method) |
| Period | 1 / Frequency |
| Min | Minimum sample value |
| Max | Maximum sample value |
| Peak-to-peak | Max − Min |
| Rise time | 10%–90% rising edge duration |
| Fall time | 90%–10% falling edge duration |
| Duty cycle | High-time / Period for a periodic signal |

### 7.3 Bode / Frequency-Domain Measurements

| Measurement | Description |
|---|---|
| Gain margin | dB of gain at phase = −180° |
| Phase margin | Degrees of phase at 0 dB gain crossover |
| Delay margin | Phase margin / (2π × gain-crossover frequency) |
| Bandwidth (−3 dB) | Frequency at which gain drops 3 dB below the DC value |
| Peak gain | Maximum gain value in dB and at which frequency |

---

## 8. DC and Parameter Sweep Display

### 8.1 Operating-Point Table

For DC operating-point simulations the viewer shows a searchable table with columns: **Node / Branch**, **Quantity**, **Value**, **Unit**. The table is sortable by any column.

### 8.2 XY Sweep Curves

For parameter sweeps (DC sweep, temperature sweep, etc.) the result is rendered on a standard axis in XY sweep mode (§4.4). Multiple output variables can be overlaid on the same axis.

---

## 9. Export

### 9.1 Figure Export

The user opens the export dialog from the toolbar. Options:

- **Format:** PNG, JPEG, SVG
- **DPI:** numeric input (default 150; range 72–600)
- **Size:** width × height in pixels (defaults to current figure render size)
- **Background:** transparent (PNG/SVG only) or white

### 9.2 Individual Axis Export

Right-clicking any axis header exposes "Export axis…" which opens the same dialog scoped to that axis only.

---

## 10. Live Streaming

Streaming is genuinely concurrent with the solve, not merely a fast post-solve replay. For **transient (TRAN) and noise analyses**, the backend tails ngspice's/Xyce's raw output file as the SPICE subprocess writes it (both write incrementally in real time — confirmed empirically, not just buffered until exit) and pushes `waveform_chunk` messages over the IPC channel as new points become available, well before the solve finishes. AC, DC-sweep, and OP analyses still deliver their results in full at completion, since their postprocessing (Bode margins, magnitude/phase split, the operating-point table) needs the whole curve and isn't safe to compute incrementally point-by-point.

Each chunk carries a contiguous slice of the sweep axis alongside the values (`x`, §11) — required because SPICE step sizes are non-uniform, so a chunk's `t_start`/`t_end` bounds alone can't reconstruct per-point positions. The axis renders appended data without resetting the current zoom/pan state. Measurements re-compute on each chunk if cursor-window mode is active and both cursors are within the already-received range.

The signal browser shows a pulsing indicator next to any signal that is still streaming. Once a signal's `waveform_done` arrives, the client discards its live-accumulated array and re-fetches the signal through the ordinary pyramidal-HDF5/LOD-backed path (§8.2 of the backend spec) — so zoom/pan after completion is always backed by the authoritative decimated data, not the raw client-assembled stream.

---

## 11. Backend Data Contract

The backend must tag every result signal with the following metadata fields. These are consumed by the frontend to determine axis mode (§4.4) and available measurements (§7).

| Field | Type | Values |
|---|---|---|
| `analysis` | string | `transient`, `ac_mag`, `ac_phase`, `dc_op`, `dc_sweep`, `noise` |
| `quantity` | string | `voltage`, `current`, `power`, `temperature`, `dimensionless`, … |
| `unit` | string | SI unit string, e.g., `V`, `A`, `W`, `°C` |
| `domain` | string | `time`, `frequency`, `parameter` |
| `swept_param` | string? | Present only for `dc_sweep`; name of the swept variable |

For AC analysis the backend produces two signal arrays per probed node: one tagged `ac_mag` and one tagged `ac_phase`, both sharing a common frequency vector.

Streaming chunks use the following envelope:

```json
{
  "type": "waveform_chunk",
  "signal_id": "<string>",
  "t_start": 1.2e-6,
  "t_end":   2.4e-6,
  "x":       [1.2e-6, 1.4e-6, ...],
  "values":  [...]
}
```

`x` carries the exact sweep-axis value for each entry in `values` (time/frequency/parameter, matching `domain` above) — required for a correct reconstruction of `WaveformSignal.time` client-side, since SPICE step sizes are non-uniform. Older/synthetic messages may omit `x`; the client then keeps values but not a usable time axis for that chunk (no live rendering, matching pre-live-streaming behavior) until the signal is later replaced by a full fetch.

Chunks for a given `signal_id` arrive in order and are guaranteed to be fully sent (not merely scheduled) before that signal's `waveform_done` — the backend gathers every in-flight chunk-send task before emitting `waveform_done` and the final `simulate_result`, so the client never has to guard against a stale chunk arriving after it has already treated the signal as complete.

A final `waveform_done` message marks the end of the stream for a given signal.

---

## 12. Out of Scope (v1)

- On-schematic DC annotation (voltages drawn next to schematic nodes)
- Mixed-mode axes (time-domain + frequency-domain on the same axis)
- 3-D surface plots
- Animated playback of transient results
- User-defined Python post-processing scripts inside the viewer
