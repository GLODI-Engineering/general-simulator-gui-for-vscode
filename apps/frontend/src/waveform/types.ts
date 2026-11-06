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
