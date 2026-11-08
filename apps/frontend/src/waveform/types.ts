import type { MeasurementKey } from "./measurements";

export interface Figure {
  id: string;
  name: string;
  rows: number;
  cols: number;
  axesIds: string[];
  /** FE-167: when set, GridLayout renders only this axes at full figure size (others stay mounted but hidden). */
  maximizedAxesId?: string;
  /** FE-169: the auto-created X-coupling group id for this figure's own axes (distinct from any user-made explicit group). */
  autoXCouplingGroupId?: string;
  /**
   * Relative heights of the grid's rows, and widths of its columns.
   *
   * Fractions, one per track, summing to whatever they like — only the
   * ratios matter. Absent means every track is equal, which is how a figure
   * starts. Kept per figure because the right split depends on what is
   * being looked at: a gate drive beside a slow thermal rise wants very
   * different proportions from two output voltages.
   */
  rowSizes?: number[];
  colSizes?: number[];
}

export interface SignalRef {
  simId: string;
  signalName: string;
  color: string;
  /**
   * Display-only multiplier, 1 when unset.
   *
   * A current of 2 A and a voltage of 48 V on one pair of axes leaves the
   * current as a flat line against the voltage's scale. Scoping practice is
   * to scale the small trace until its *shape* is visible next to the large
   * one — so this multiplies what is drawn, and nothing else. Measurements,
   * cursors and every export read the signal's real values; the legend says
   * "×10" so the plot never quietly claims the current is 20 A.
   */
  gain?: number;
  /**
   * How many runs ago this trace is: absent or 0 for the current run, 1 for
   * the one before it, and so on.
   *
   * Set only on the refs a history overlay synthesises — `Axes.signals`
   * holds the user's chosen set and never contains one of these, so adding
   * and removing a signal stays about the signal, not about which run.
   */
  age?: number;
}

export type AxesMode = "time" | "bode" | "xy";

export interface Axes {
  id: string;
  figureId: string;
  row: number;
  col: number;
  signals: SignalRef[];
  mode: AxesMode;
  couplingGroupId?: string;
  /** Visible x-range set by toolbar zoom/pan controls. */
  xMin?: number;
  xMax?: number;
  /** Visible y-range propagated by coupling group zoom sync. */
  yMin?: number;
  yMax?: number;
  /** Time (x) positions of vertical measurement cursors A and B. */
  cursorA?: number;
  cursorB?: number;
  /** FE-165: value (y, on the primary spine) positions of horizontal cursors A and B. */
  cursorAH?: number;
  cursorBH?: number;
  /** When true the pointer changes to a hand and drag pans the plot. */
  panMode?: boolean;
  /**
   * How many past runs to draw behind the current one. 0 or absent is just
   * the current run.
   */
  historyDepth?: number;
  /**
   * Which measurements the bar above this axes shows, in order.
   *
   * Per axes rather than global: the measurements worth watching on a gate
   * drive (duty cycle, rise time) are not the ones worth watching on an
   * output rail (mean, ripple).
   */
  measurements?: MeasurementKey[];
  /**
   * Which signals the measurement table covers, as `simId::signalName` keys.
   *
   * Absent means none, and that is deliberate: measuring every trace the
   * moment a measurement is ticked does work nobody asked for. On an axes
   * carrying eight traces it also buries the one number being looked for in
   * seven others. The choice of *what to measure* is as much the user's as
   * the choice of which measurement.
   */
  measuredSignals?: string[];
  /**
   * Collapsed to its header, keeping its place in the grid.
   *
   * Distinct from closing: a figure laid out over several axes loses its
   * shape if the only way to get one out of the way is to delete it.
   */
  collapsed?: boolean;
}

export interface CouplingGroup {
  id: string;
  name: string;
  axesIds: string[];
  lockX: boolean;
  lockY: boolean;
}

export interface WaveformSignal {
  simId: string;
  name: string;
  analysis: string;
  quantity: string;
  unit: string;
  domain: string;
  time: Float64Array;
  values: Float64Array;
}
