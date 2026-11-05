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
