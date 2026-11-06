import type { GsimSimResultFigureLayout } from "../results/types";
/**
 * Building an `ExportSubject` for one axes, or for a whole figure.
 *
 * Both are read from the store at export time rather than captured when the
 * dialog opens, so what lands in the file is what was on screen when Export
 * was pressed — not what was there a minute earlier.
 */
import { useWaveformStore } from "../store/waveform";
import type { ExportSubject } from "./ExportDialog";
import { runFor } from "./export-data";
import type { SignalRef, WaveformSignal } from "./types";

function resolve(refs: SignalRef[], cache: Map<string, WaveformSignal>): WaveformSignal[] {
  const out: WaveformSignal[] = [];
  for (const ref of refs) {
    const signal = cache.get(`${ref.simId}::${ref.signalName}`);
    if (signal) out.push(signal);
  }
  return out;
}

/** The uPlot canvases inside a mounted axes element, in DOM order. */
function canvasesIn(element: Element): HTMLCanvasElement[] {
  return [...element.querySelectorAll<HTMLCanvasElement>("canvas")];
}

export function axesExportSubject(
  axesId: string,
  plotElement: Element,
  latest: () => { refs: SignalRef[]; signalCache: Map<string, WaveformSignal> },
): ExportSubject {
  const signals = () => {
    const { refs, signalCache } = latest();
    return resolve(refs, signalCache);
  };
  return {
    kind: "axes",
    label: labelForAxes(axesId, signals()),
    canvases: () => canvasesIn(plotElement),
    signals,
    layout: () => [
      {
        name: "Axes",
        rows: 1,
        cols: 1,
        axes: [
          {
            row: 0,
            col: 0,
            signals: latest().refs.map((r) => r.signalName),
            colors: latest().refs.map((r) => r.color),
          },
        ],
      },
    ],
    run: () => runFor(signals(), latest().refs[0]?.simId ?? axesId),
  };
}

/**
 * Name the file after what is on the plot, not after an id.
 *
 * `axes-7f0888d2-...uuid` is what this produced before, and it tells the
 * person looking at their downloads folder nothing at all.
 */
function labelForAxes(axesId: string, signals: WaveformSignal[]): string {
  if (signals.length === 0) return "axes";
  const names = signals.slice(0, 3).map((s) => sanitize(s.name));
  const suffix = signals.length > 3 ? `-and-${signals.length - 3}-more` : "";
  return `${names.join("-")}${suffix}` || `axes-${axesId.slice(0, 8)}`;
}

/** A filename component: no path separators, no quoting surprises. */
export function sanitize(name: string): string {
  return name
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function figureExportSubject(figureId: string, figureElement: Element): ExportSubject {
  const read = () => {
    const state = useWaveformStore.getState();
    const figure = state.figures.get(figureId);
    const axesList = (figure?.axesIds ?? [])
      .map((id) => state.axes.get(id))
      .filter((a): a is NonNullable<typeof a> => a !== undefined)
      // Row-major, so the exported stack is in the order they are read.
      .sort((a, b) => a.row - b.row || a.col - b.col);
    return { figure, axesList, cache: state.signalCache };
  };

  const signals = () => {
    const { axesList, cache } = read();
    const seen = new Set<string>();
    const out: WaveformSignal[] = [];
    for (const axes of axesList) {
      for (const signal of resolve(axes.signals, cache)) {
        // A signal shown on two axes of one figure is still one column in
        // the exported table.
        const key = `${signal.simId}::${signal.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(signal);
      }
    }
    return out;
  };

  const layout = (): GsimSimResultFigureLayout[] => {
    const { figure, axesList } = read();
    if (!figure) return [];
    return [
      {
        name: figure.name,
        rows: figure.rows,
        cols: figure.cols,
        axes: axesList.map((axes) => ({
          row: axes.row,
          col: axes.col,
          signals: axes.signals.map((s) => s.signalName),
          colors: axes.signals.map((s) => s.color),
        })),
      },
    ];
  };

  return {
    kind: "figure",
    label: sanitize(read().figure?.name ?? "figure") || "figure",
    canvases: () => canvasesIn(figureElement),
    signals,
    layout,
    run: () => runFor(signals(), read().axesList[0]?.signals[0]?.simId ?? figureId),
  };
}
