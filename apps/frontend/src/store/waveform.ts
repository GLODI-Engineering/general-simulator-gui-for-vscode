import { create } from "zustand";

import { getIpcClient } from "../ipc/transport";
import type { MeasurementKey } from "../waveform/measurements";
import type {
  Axes,
  AxesMode,
  CouplingGroup,
  Figure,
  SignalRef,
  WaveformSignal,
} from "../waveform/types";

// Stable palette for signal colors, cycled via index.
const _COLOR_PALETTE = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#a855f7",
];

function _pickColor(index: number): string {
  return _COLOR_PALETTE[index % _COLOR_PALETTE.length] ?? "#3b82f6";
}

/**
 * How many past runs to keep by default.
 *
 * Each one is a full copy of every signal, so this is memory, not a
 * preference: four runs of a 25,000-step, 11-signal sweep is about 9 MB.
 * Enough to see a trend across a few parameter tweaks; small enough not to
 * be the reason a long sweep runs out of room.
 */
export const DEFAULT_HISTORY_LIMIT = 4;

function _uuid(): string {
  return crypto.randomUUID();
}

function _signalCacheKey(simId: string, signalName: string): string {
  return `${simId}::${signalName}`;
}

export interface WaveformState {
  figures: Map<string, Figure>;
  axes: Map<string, Axes>;
  /**
   * The axes the signal browser's checkboxes act on.
   *
   * Something has to answer "add it where?", and an implicit notion of
   * focus answers it differently depending on where the pointer last was.
   * This is explicit: the browser shows which axes it is targeting and lets
   * it be changed, and clicking an axes retargets it.
   */
  activeAxesId: string | null;

  /**
   * Past runs, newest first, not including the one on screen.
   *
   * Re-running a changed component and seeing what moved is the single most
   * common thing anyone does with a simulator, and it was impossible here:
   * every run replaced the last, so a comparison meant exporting both and
   * opening them in something else. The samples are already in the cache —
   * keeping the previous run's sim ids is all that was missing.
   */
  runHistory: string[];
  /** The run currently on screen, if any. */
  currentSimId: string | null;
  /** How many past runs to keep. Beyond this the oldest is dropped. */
  historyLimit: number;
  couplingGroups: Map<string, CouplingGroup>;
  signalCache: Map<string, WaveformSignal>;
  streamingSignals: Set<string>;

  // Figure actions
  createFigure: (name: string, rows: number, cols: number) => string;
  deleteFigure: (id: string) => void;
  renameFigure: (id: string, name: string) => void;
  /** Resize a figure's grid, dropping any axes whose (row, col) falls outside the new bounds. */
  resizeFigure: (id: string, rows: number, cols: number) => void;
  /** FE-167: set (or clear, with null) which axes is maximized to fill the figure. */
  setMaximizedAxes: (figureId: string, axesId: string | null) => void;

  // Axes actions
  createAxes: (figureId: string, row: number, col: number, mode?: AxesMode) => string;
  deleteAxes: (id: string) => void;

  // Signal actions
  addSignalToAxes: (axesId: string, simId: string, signalName: string) => void;
  removeSignalFromAxes: (axesId: string, simId: string, signalName: string) => void;
  /** FE-161: update one signal's display color on an axes. No-op if the (simId, signalName) pair isn't on that axes. */
  setSignalColor: (axesId: string, simId: string, signalName: string, color: string) => void;
  /**
   * Set one signal's display-only multiplier on an axes (see SignalRef.gain).
   * A gain of 1, or a non-finite or zero value, clears it.
   */
  setSignalGain: (axesId: string, simId: string, signalName: string, gain: number) => void;
  /** Replace all signals on the given axes atomically (clears old, adds new). */
  resetAxesSignals: (axesId: string, signals: Array<{ simId: string; signalName: string }>) => void;
  /** FE-164: empty an axes' signals and reset its zoom/cursor state, leaving id/figureId/row/col/mode/couplingGroupId untouched. */
  clearAxes: (axesId: string) => void;
  cacheSignal: (simId: string, name: string, data: WaveformSignal) => void;
  fetchSignal: (simId: string, signalName: string) => Promise<void>;

  // Coupling group actions
  createCouplingGroup: (name: string, lockX: boolean, lockY: boolean) => string;
  assignAxesToGroup: (axesId: string, groupId: string) => void;
  /**
   * FE-169: ensure every axes in the figure that isn't already in a
   * *different*, explicit (user-made) coupling group is X-coupled via a
   * single auto-created per-figure group. No-op for a figure with fewer
   * than 2 axes (nothing to couple) or that doesn't exist.
   */
  ensureFigureXCoupling: (figureId: string) => void;
  deleteCouplingGroup: (id: string) => void;

  /** Point the signal browser at an axes. Null when it no longer exists. */
  setActiveAxes: (axesId: string | null) => void;

  /**
   * Record that a new run is replacing the current one, moving the outgoing
   * run into the history and evicting anything past `historyLimit`.
   */
  beginRun: (simId: string) => void;
  /** Keep more or fewer past runs. Shrinking evicts the oldest immediately. */
  setHistoryLimit: (limit: number) => void;
  /** How many past runs an axes draws behind the current one. */
  setAxesHistoryDepth: (axesId: string, depth: number) => void;

  /** Which measurements the bar above this axes shows, in order. */
  setAxesMeasurements: (axesId: string, measurements: MeasurementKey[]) => void;
  setAxesMeasuredSignals: (axesId: string, signalKeys: string[]) => void;
  setAxesCollapsed: (axesId: string, collapsed: boolean) => void;

  // Zoom / cursor actions
  setAxesZoom: (axesId: string, xMin: number, xMax: number) => void;
  /** FE-166: set the y-range independently of x (used by "Fit Y"). */
  setAxesYZoom: (axesId: string, yMin: number, yMax: number) => void;
  /** FE-165: "A"/"B" set the vertical (time) cursors; "AH"/"BH" set the horizontal (value, primary spine) cursors. */
  setAxesCursor: (axesId: string, cursor: "A" | "B" | "AH" | "BH", value: number) => void;
  setAxesPanMode: (axesId: string, panMode: boolean) => void;
  propagateZoom: (axesId: string, xMin: number, xMax: number, yMin: number, yMax: number) => void;

  // Streaming
  markStreaming: (signalId: string) => void;
  markStreamingDone: (signalId: string) => void;
  /**
   * Append a chunk of values (from a waveform_chunk IPC message) to the
   * cached signal identified by signalId (format: "simId::signalName").
   * Creates a stub WaveformSignal in the cache when the first chunk arrives.
   * Triggers a store update so Axes components re-render via their selectors.
   *
   * `x` carries the exact per-point sweep-axis value (time/frequency/
   * parameter) for each entry in `values` — required for the chart to
   * actually render while streaming (BE-54): without it `time` stays empty
   * and Axes treats the signal as having no data. Omitting `x` keeps the
   * pre-BE-54 behavior (values accumulate but nothing renders until the
   * signal is later replaced by a full fetchSignal() load).
   */
  appendChunk: (signalId: string, values: ArrayLike<number>, x?: ArrayLike<number>) => void;
}

/** The cache with every signal belonging to `simIds` removed. */
function _withoutRuns(
  cache: Map<string, WaveformSignal>,
  simIds: string[],
): Map<string, WaveformSignal> {
  if (simIds.length === 0) return cache;
  const dropped = new Set(simIds);
  const next = new Map(cache);
  for (const [key, signal] of cache) {
    if (dropped.has(signal.simId)) next.delete(key);
  }
  return next;
}

export const useWaveformStore = create<WaveformState>((set, get) => ({
  figures: new Map(),
  axes: new Map(),
  activeAxesId: null,
  runHistory: [],
  currentSimId: null,
  historyLimit: DEFAULT_HISTORY_LIMIT,
  couplingGroups: new Map(),
  signalCache: new Map(),
  streamingSignals: new Set(),

  createFigure: (name, rows, cols) => {
    const id = _uuid();
    const figure: Figure = { id, name, rows, cols, axesIds: [] };
    set((state) => {
      const figures = new Map(state.figures);
      figures.set(id, figure);
      return { figures };
    });
    return id;
  },

  deleteFigure: (id) => {
    set((state) => {
      const figure = state.figures.get(id);
      if (!figure) return {};
      const figures = new Map(state.figures);
      figures.delete(id);
      const axes = new Map(state.axes);
      for (const axesId of figure.axesIds) {
        axes.delete(axesId);
      }
      return { figures, axes };
    });
  },

  renameFigure: (id, name) => {
    set((state) => {
      const figure = state.figures.get(id);
      if (!figure) return {};
      const figures = new Map(state.figures);
      figures.set(id, { ...figure, name });
      return { figures };
    });
  },

  resizeFigure: (id, rows, cols) => {
    set((state) => {
      const figure = state.figures.get(id);
      if (!figure) return {};

      const axes = new Map(state.axes);
      const survivingAxesIds: string[] = [];
      for (const axesId of figure.axesIds) {
        const ax = state.axes.get(axesId);
        if (ax && ax.row < rows && ax.col < cols) {
          survivingAxesIds.push(axesId);
        } else {
          axes.delete(axesId);
        }
      }

      const figures = new Map(state.figures);
      figures.set(id, { ...figure, rows, cols, axesIds: survivingAxesIds });
      return { figures, axes };
    });
  },

  setMaximizedAxes: (figureId, axesId) => {
    set((state) => {
      const figure = state.figures.get(figureId);
      if (!figure) return {};
      const figures = new Map(state.figures);
      figures.set(figureId, { ...figure, maximizedAxesId: axesId ?? undefined });
      return { figures };
    });
  },

  createAxes: (figureId, row, col, mode = "time") => {
    const id = _uuid();
    const axesEntry: Axes = { id, figureId, row, col, signals: [], mode };
    set((state) => {
      const axes = new Map(state.axes);
      axes.set(id, axesEntry);
      const figures = new Map(state.figures);
      const figure = figures.get(figureId);
      if (figure) {
        figures.set(figureId, { ...figure, axesIds: [...figure.axesIds, id] });
      }
      return { axes, figures };
    });
    // FE-169: a figure that just gained its 2nd+ axes gets its axes
    // X-coupled by default (a fresh multi-axes figure shouldn't require a
    // manual step to link zoom across its axes).
    get().ensureFigureXCoupling(figureId);
    // The signal browser needs somewhere to put a ticked signal from the
    // moment there is anywhere at all.
    if (get().activeAxesId === null) get().setActiveAxes(id);
    return id;
  },

  deleteAxes: (id) => {
    set((state) => {
      const axesEntry = state.axes.get(id);
      if (!axesEntry) return {};
      const axes = new Map(state.axes);
      axes.delete(id);
      const activeAxesId =
        state.activeAxesId === id ? (axes.keys().next().value ?? null) : state.activeAxesId;
      const figures = new Map(state.figures);
      const figure = figures.get(axesEntry.figureId);
      if (figure) {
        figures.set(axesEntry.figureId, {
          ...figure,
          axesIds: figure.axesIds.filter((aid) => aid !== id),
        });
      }
      return { axes, figures, activeAxesId };
    });
  },

  addSignalToAxes: (axesId, simId, signalName) => {
    const { signalCache, axes } = get();
    const axesEntry = axes.get(axesId);
    if (!axesEntry) return;

    const colorIndex = axesEntry.signals.length;
    const ref: SignalRef = { simId, signalName, color: _pickColor(colorIndex) };

    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      axesMap.set(axesId, { ...entry, signals: [...entry.signals, ref] });
      return { axes: axesMap };
    });

    const cacheKey = _signalCacheKey(simId, signalName);
    if (!signalCache.has(cacheKey)) {
      void get().fetchSignal(simId, signalName);
    }
  },

  removeSignalFromAxes: (axesId, simId, signalName) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      axesMap.set(axesId, {
        ...entry,
        signals: entry.signals.filter((s) => !(s.simId === simId && s.signalName === signalName)),
      });
      return { axes: axesMap };
    });
  },

  setSignalColor: (axesId, simId, signalName, color) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      const idx = entry.signals.findIndex((s) => s.simId === simId && s.signalName === signalName);
      if (idx === -1) return {};
      const signals = [...entry.signals];
      signals[idx] = { ...(signals[idx] as SignalRef), color };
      axesMap.set(axesId, { ...entry, signals });
      return { axes: axesMap };
    });
  },

  setSignalGain: (axesId, simId, signalName, gain) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      const idx = entry.signals.findIndex((s) => s.simId === simId && s.signalName === signalName);
      if (idx === -1) return {};
      const signals = [...entry.signals];
      const current = signals[idx] as SignalRef;
      // A gain of 0 would flatten the trace onto the axis and read as "this
      // signal is zero", which is the one thing a display aid must never
      // say. Non-finite is the same mistake typed differently.
      const clean = Number.isFinite(gain) && gain !== 0 ? gain : 1;
      signals[idx] = clean === 1 ? { ...current, gain: undefined } : { ...current, gain: clean };
      axesMap.set(axesId, { ...entry, signals });
      return { axes: axesMap };
    });
  },

  beginRun: (simId) => {
    set((state) => {
      if (state.currentSimId === simId) return {};
      const history = state.currentSimId
        ? [state.currentSimId, ...state.runHistory.filter((id) => id !== state.currentSimId)]
        : [...state.runHistory];
      const kept = history.slice(0, Math.max(0, state.historyLimit));
      const evicted = history.slice(Math.max(0, state.historyLimit));
      return {
        currentSimId: simId,
        runHistory: kept,
        signalCache: _withoutRuns(state.signalCache, evicted),
      };
    });
  },

  setHistoryLimit: (limit) => {
    set((state) => {
      const clean = Math.max(0, Math.floor(limit));
      const kept = state.runHistory.slice(0, clean);
      const evicted = state.runHistory.slice(clean);
      return {
        historyLimit: clean,
        runHistory: kept,
        signalCache: _withoutRuns(state.signalCache, evicted),
      };
    });
  },

  setAxesHistoryDepth: (axesId, depth) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      axesMap.set(axesId, { ...entry, historyDepth: Math.max(0, Math.floor(depth)) });
      return { axes: axesMap };
    });
  },

  setActiveAxes: (axesId) => {
    set((state) => (state.activeAxesId === axesId ? {} : { activeAxesId: axesId }));
  },

  setAxesMeasurements: (axesId, measurements) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      axesMap.set(axesId, { ...entry, measurements });
      return { axes: axesMap };
    });
  },
  setAxesMeasuredSignals: (axesId, signalKeys) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      axesMap.set(axesId, { ...entry, measuredSignals: signalKeys });
      return { axes: axesMap };
    });
  },
  setAxesCollapsed: (axesId, collapsed) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      axesMap.set(axesId, { ...entry, collapsed });
      return { axes: axesMap };
    });
  },

  resetAxesSignals: (axesId, signals) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      const refs: SignalRef[] = signals.map(({ simId, signalName }, i) => ({
        simId,
        signalName,
        color: _pickColor(i),
      }));
      axesMap.set(axesId, { ...entry, signals: refs });
      return { axes: axesMap };
    });
    // Kick off fetches for any uncached signals.
    const { signalCache, fetchSignal } = get();
    for (const { simId, signalName } of signals) {
      const key = _signalCacheKey(simId, signalName);
      if (!signalCache.has(key)) {
        void fetchSignal(simId, signalName);
      }
    }
  },

  clearAxes: (axesId) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      axesMap.set(axesId, {
        ...entry,
        signals: [],
        xMin: undefined,
        xMax: undefined,
        yMin: undefined,
        yMax: undefined,
        cursorA: undefined,
        cursorB: undefined,
        cursorAH: undefined,
        cursorBH: undefined,
      });
      return { axes: axesMap };
    });
  },

  cacheSignal: (simId, name, data) => {
    const key = _signalCacheKey(simId, name);
    set((state) => {
      const signalCache = new Map(state.signalCache);
      signalCache.set(key, data);
      return { signalCache };
    });
  },

  fetchSignal: async (simId, signalName) => {
    const cacheKey = _signalCacheKey(simId, signalName);
    if (get().signalCache.has(cacheKey)) return;

    try {
      const slice = await getIpcClient().waveformGet(simId, [signalName]);
      const trace = slice.traces[0];
      if (!trace) return;

      const signal: WaveformSignal = {
        simId,
        name: signalName,
        // BE-47 metadata comes from the manifest via waveformGet(); these
        // literals are only the fallback for callers/fixtures that omit it
        // (previously always hardcoded here regardless of the real
        // analysis type, which broke Bode-mode axis labeling for AC runs —
        // every signal looked like a plain transient/time-domain trace).
        analysis: trace.analysis ?? "transient",
        quantity: trace.quantity ?? "dimensionless",
        unit: trace.unit ?? "",
        domain: trace.domain ?? "time",
        time: new Float64Array(slice.time),
        values: new Float64Array(trace.values),
      };
      get().cacheSignal(simId, signalName, signal);
    } catch {
      // Fetch failures are silent — the axes will show no data for this signal.
    }
  },

  createCouplingGroup: (name, lockX, lockY) => {
    const id = _uuid();
    const group: CouplingGroup = { id, name, axesIds: [], lockX, lockY };
    set((state) => {
      const couplingGroups = new Map(state.couplingGroups);
      couplingGroups.set(id, group);
      return { couplingGroups };
    });
    return id;
  },

  assignAxesToGroup: (axesId, groupId) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};

      // Remove from previous group if any.
      const couplingGroups = new Map(state.couplingGroups);
      if (entry.couplingGroupId) {
        const prev = couplingGroups.get(entry.couplingGroupId);
        if (prev) {
          couplingGroups.set(entry.couplingGroupId, {
            ...prev,
            axesIds: prev.axesIds.filter((aid) => aid !== axesId),
          });
        }
      }

      axesMap.set(axesId, { ...entry, couplingGroupId: groupId });

      const group = couplingGroups.get(groupId);
      if (group && !group.axesIds.includes(axesId)) {
        couplingGroups.set(groupId, { ...group, axesIds: [...group.axesIds, axesId] });
      }

      return { axes: axesMap, couplingGroups };
    });
  },

  ensureFigureXCoupling: (figureId) => {
    const figure = get().figures.get(figureId);
    if (!figure || figure.axesIds.length < 2) return;

    let groupId = figure.autoXCouplingGroupId;
    if (!groupId || !get().couplingGroups.has(groupId)) {
      groupId = get().createCouplingGroup(`${figure.name} (auto X)`, true, false);
      const createdGroupId = groupId;
      set((state) => {
        const figures = new Map(state.figures);
        const fig = figures.get(figureId);
        if (!fig) return {};
        figures.set(figureId, { ...fig, autoXCouplingGroupId: createdGroupId });
        return { figures };
      });
    }

    for (const axesId of figure.axesIds) {
      const ax = get().axes.get(axesId);
      if (!ax) continue;
      // Leave alone if already in a *different*, explicit (user-made) group.
      if (ax.couplingGroupId && ax.couplingGroupId !== groupId) continue;
      if (ax.couplingGroupId === groupId) continue;
      get().assignAxesToGroup(axesId, groupId);
    }
  },

  deleteCouplingGroup: (id) => {
    set((state) => {
      const couplingGroups = new Map(state.couplingGroups);
      couplingGroups.delete(id);
      // Clear couplingGroupId from all axes that belonged to this group.
      const axesMap = new Map(state.axes);
      for (const [axesId, entry] of axesMap) {
        if (entry.couplingGroupId === id) {
          axesMap.set(axesId, { ...entry, couplingGroupId: undefined });
        }
      }
      return { axes: axesMap, couplingGroups };
    });
  },

  setAxesZoom: (axesId, xMin, xMax) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      axesMap.set(axesId, { ...entry, xMin, xMax });
      return { axes: axesMap };
    });
  },

  setAxesYZoom: (axesId, yMin, yMax) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      axesMap.set(axesId, { ...entry, yMin, yMax });
      return { axes: axesMap };
    });
  },

  setAxesCursor: (axesId, cursor, value) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      const field = {
        A: "cursorA",
        B: "cursorB",
        AH: "cursorAH",
        BH: "cursorBH",
      }[cursor] as "cursorA" | "cursorB" | "cursorAH" | "cursorBH";
      axesMap.set(axesId, { ...entry, [field]: value });
      return { axes: axesMap };
    });
  },

  setAxesPanMode: (axesId, panMode) => {
    set((state) => {
      const axesMap = new Map(state.axes);
      const entry = axesMap.get(axesId);
      if (!entry) return {};
      axesMap.set(axesId, { ...entry, panMode });
      return { axes: axesMap };
    });
  },

  propagateZoom: (axesId, xMin, xMax, yMin, yMax) => {
    set((state) => {
      const sourceEntry = state.axes.get(axesId);
      if (!sourceEntry) return {};

      const axesMap = new Map(state.axes);
      // Always record the source axes' own zoom values, even when it isn't in
      // a coupling group — otherwise a plain drag-zoom on a standalone axes
      // never reaches the store, leaving the toolbar's Zoom In/Out/Fit and
      // cursor math working off stale (undefined) bounds.
      axesMap.set(axesId, { ...sourceEntry, xMin, xMax, yMin, yMax });

      // Propagate to sibling axes in the group, if any.
      const group = sourceEntry.couplingGroupId
        ? state.couplingGroups.get(sourceEntry.couplingGroupId)
        : undefined;
      if (group) {
        for (const siblingId of group.axesIds) {
          if (siblingId === axesId) continue;
          const sibling = axesMap.get(siblingId);
          if (!sibling) continue;
          axesMap.set(siblingId, {
            ...sibling,
            ...(group.lockX ? { xMin, xMax } : {}),
            ...(group.lockY ? { yMin, yMax } : {}),
          });
        }
      }

      return { axes: axesMap };
    });
  },

  markStreaming: (signalId) => {
    set((state) => {
      const streamingSignals = new Set(state.streamingSignals);
      streamingSignals.add(signalId);
      return { streamingSignals };
    });
  },

  markStreamingDone: (signalId) => {
    set((state) => {
      const streamingSignals = new Set(state.streamingSignals);
      streamingSignals.delete(signalId);
      // BE-54: drop the client-accumulated cache entry so the next read
      // goes through fetchSignal() and lands on the authoritative,
      // pyramidal-HDF5-backed data (with real LOD support for zoom/pan)
      // instead of permanently serving the raw array assembled from live
      // WS chunks — fetchSignal() is a no-op whenever the cache already
      // has an entry for the key, so without this the finished signal
      // would never pick up the real backend data.
      const signalCache = new Map(state.signalCache);
      signalCache.delete(signalId);
      return { streamingSignals, signalCache };
    });

    const separatorIdx = signalId.indexOf("::");
    if (separatorIdx >= 0) {
      const simId = signalId.slice(0, separatorIdx);
      const name = signalId.slice(separatorIdx + 2);
      void get().fetchSignal(simId, name);
    }
  },

  appendChunk: (signalId, values, x) => {
    set((state) => {
      const signalCache = new Map(state.signalCache);
      const existing = signalCache.get(signalId);
      const xValues = x ?? [];

      const concat = (base: Float64Array, extra: ArrayLike<number>): Float64Array => {
        const merged = new Float64Array(base.length + extra.length);
        merged.set(base, 0);
        for (let i = 0; i < extra.length; i++) {
          merged[base.length + i] = extra[i] ?? 0;
        }
        return merged;
      };

      let updated: WaveformSignal;
      if (existing) {
        updated = {
          ...existing,
          values: concat(existing.values, values),
          time: concat(existing.time, xValues),
        };
      } else {
        // First chunk for this signal: derive simId and name from the cache key.
        const separatorIdx = signalId.indexOf("::");
        const simId = separatorIdx >= 0 ? signalId.slice(0, separatorIdx) : signalId;
        const name = separatorIdx >= 0 ? signalId.slice(separatorIdx + 2) : signalId;
        updated = {
          simId,
          name,
          analysis: "transient",
          quantity: "dimensionless",
          unit: "",
          domain: "time",
          time: new Float64Array(xValues),
          values: new Float64Array(values),
        };
      }

      signalCache.set(signalId, updated);

      // Also mark the signal as streaming if not already tracked.
      const streamingSignals = state.streamingSignals.has(signalId)
        ? state.streamingSignals
        : new Set(state.streamingSignals).add(signalId);

      return { signalCache, streamingSignals };
    });
  },
}));
