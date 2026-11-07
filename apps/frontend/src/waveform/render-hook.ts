/**
 * A browser-side door into the waveform store, so the plot can be *rendered
 * and looked at* without a live kernel.
 *
 * Rendering quality is a correctness property here (AGENTS.md invariant 6),
 * and it is the one property no unit test can check: no assertion notices
 * that a legend bar is dark on a white chart, that two traces are the same
 * blue, that tick labels collide, or that the grid is heavier than the data.
 * `scripts/render-schematic.mjs` already settles that question for the
 * schematic via `window.__gensim_load_document`. This is the same door for
 * the waveform surface, used by `scripts/render-waveform.mjs`.
 *
 * It writes straight into `signalCache` *before* attaching refs to an axes,
 * which is what keeps it kernel-free: `addSignalToAxes` only calls
 * `fetchSignal` for a cache miss, so a pre-seeded cache never reaches the
 * network.
 */
import { useWaveformStore } from "../store/waveform";
import type { WaveformSignal } from "./types";

export interface RenderSignalSpec {
  name: string;
  unit: string;
  quantity: string;
  /** "tran" (default), "ac_mag", "ac_phase" — drives Bode mode. */
  analysis?: string;
  /** "time" (default), "frequency", "parameter" — drives the x-axis label. */
  domain?: string;
  x: number[];
  y: number[];
}

export interface RenderAxesSpec {
  row: number;
  col: number;
  /** Signal names, resolved against `signals` by name. */
  signals: string[];
  cursorA?: number;
  cursorB?: number;
}

export interface RenderRunSpec {
  simId: string;
  signals: RenderSignalSpec[];
}

export interface RenderWaveformSpec {
  simId?: string;
  signals: RenderSignalSpec[];
  /**
   * Earlier runs, newest first. Seeded exactly as a sequence of real runs
   * would leave the store, so the history overlay can be rendered and
   * looked at.
   */
  history?: RenderRunSpec[];
  /** Past runs each axes draws behind the current one. */
  historyDepth?: number;
  figures: Array<{
    name: string;
    rows: number;
    cols: number;
    axes: RenderAxesSpec[];
  }>;
}

declare global {
  // eslint-disable-next-line no-var
  var __gensim_load_waveform: ((spec: RenderWaveformSpec) => void) | undefined;
}

export function loadWaveformForRender(spec: RenderWaveformSpec): void {
  const simId = spec.simId ?? "render";
  const store = useWaveformStore.getState();

  // Oldest first, so each beginRun pushes the previous one into the history
  // the way a real sequence of runs does.
  const past = [...(spec.history ?? [])].reverse();
  for (const run of past) {
    useWaveformStore.getState().beginRun(run.simId);
    for (const sig of run.signals) {
      useWaveformStore.getState().cacheSignal(run.simId, sig.name, {
        simId: run.simId,
        name: sig.name,
        analysis: sig.analysis ?? "tran",
        quantity: sig.quantity,
        unit: sig.unit,
        domain: sig.domain ?? "time",
        time: new Float64Array(sig.x),
        values: new Float64Array(sig.y),
      });
    }
  }
  if (past.length > 0) useWaveformStore.getState().beginRun(simId);

  for (const sig of spec.signals) {
    const signal: WaveformSignal = {
      simId,
      name: sig.name,
      analysis: sig.analysis ?? "tran",
      quantity: sig.quantity,
      unit: sig.unit,
      domain: sig.domain ?? "time",
      time: new Float64Array(sig.x),
      values: new Float64Array(sig.y),
    };
    store.cacheSignal(simId, sig.name, signal);
  }

  for (const fig of spec.figures) {
    const figureId = store.createFigure(fig.name, fig.rows, fig.cols);
    for (const ax of fig.axes) {
      const axesId = useWaveformStore.getState().createAxes(figureId, ax.row, ax.col);
      for (const name of ax.signals) {
        useWaveformStore.getState().addSignalToAxes(axesId, simId, name);
      }
      if (spec.historyDepth) {
        useWaveformStore.getState().setAxesHistoryDepth(axesId, spec.historyDepth);
      }
      if (ax.cursorA !== undefined) {
        useWaveformStore.getState().setAxesCursor(axesId, "A", ax.cursorA);
      }
      if (ax.cursorB !== undefined) {
        useWaveformStore.getState().setAxesCursor(axesId, "B", ax.cursorB);
      }
    }
  }
}

export function installWaveformRenderHook(): void {
  globalThis.__gensim_load_waveform = loadWaveformForRender;
}
