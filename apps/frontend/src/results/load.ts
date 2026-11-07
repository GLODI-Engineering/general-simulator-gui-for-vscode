/**
 * Putting a parsed `.gsim_sim_result` into the waveform store.
 *
 * Kept apart from `document.ts` so the parser stays a pure function of text
 * — it is the piece worth unit-testing hard, and it should not need a store
 * to run.
 */
import { useWaveformStore } from "../store/waveform";
import type { LoadedResult } from "./document";

/**
 * Replace everything the viewer is showing with this result.
 *
 * Replace, not merge: a results editor shows one file, and leaving the
 * previous file's figures behind on a revert or an external edit would show
 * two runs side by side with nothing saying which was which.
 */
export function applyResult(result: LoadedResult): void {
  useWaveformStore.setState({
    figures: new Map(),
    axes: new Map(),
    couplingGroups: new Map(),
    signalCache: new Map(),
    streamingSignals: new Set(),
    // A file holds one run, so there is no history to inherit — and
    // carrying the previous file's over would offer to overlay a run from
    // a different model entirely.
    runHistory: [],
    currentSimId: result.signals[0]?.simId ?? result.run.id,
  });

  const store = useWaveformStore.getState();
  for (const signal of result.signals) {
    store.cacheSignal(signal.simId, signal.name, signal);
  }

  const simId = result.signals[0]?.simId ?? result.run.id;
  for (const figure of result.layout) {
    const figureId = useWaveformStore
      .getState()
      .createFigure(figure.name, figure.rows, figure.cols);
    for (const axes of figure.axes) {
      const axesId = useWaveformStore.getState().createAxes(figureId, axes.row, axes.col);
      for (const [index, name] of axes.signals.entries()) {
        useWaveformStore.getState().addSignalToAxes(axesId, simId, name);
        const color = axes.colors?.[index];
        if (color) {
          useWaveformStore.getState().setSignalColor(axesId, simId, name, color);
        }
      }
    }
  }
}
