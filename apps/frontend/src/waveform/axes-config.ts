import type uPlot from "uplot";

import type { SignalRef, WaveformSignal } from "./types";

export interface SpineSpec {
  quantity: string;
  unit: string;
  scaleKey: string;
  side: 0 | 1 | 2 | 3;
}

/**
 * Return true when any signal in `refs` is an AC analysis signal
 * (analysis === "ac_mag" or "ac_phase"). Bode mode additionally forces
 * dB/degree y-axis scaling and the 0dB/margin annotation overlays — it is a
 * strict subset of "frequency domain" (see xAxisDomain), which also covers
 * NOISE results that share the log x-axis but keep their native units.
 */
export function isBodeAxes(refs: SignalRef[], cache: Map<string, WaveformSignal>): boolean {
  return refs.some((ref) => {
    const sig = cache.get(`${ref.simId}::${ref.signalName}`);
    return sig?.analysis === "ac_mag" || sig?.analysis === "ac_phase";
  });
}

export type XAxisDomain = "time" | "frequency" | "parameter";

/**
 * Derive the x-axis domain from the signals plotted on an axes, so DC
 * sweeps and NOISE results get an honest axis instead of always being
 * labeled "Time (s)". Priority when signals disagree (rare — mixing
 * analyses on one axes is unusual): frequency > parameter > time.
 */
export function xAxisDomain(refs: SignalRef[], cache: Map<string, WaveformSignal>): XAxisDomain {
  let sawParameter = false;
  for (const ref of refs) {
    const sig = cache.get(`${ref.simId}::${ref.signalName}`);
    if (sig?.domain === "frequency") return "frequency";
    if (sig?.domain === "parameter") sawParameter = true;
  }
  return sawParameter ? "parameter" : "time";
}

/** Human label for the x-axis given its domain. */
export function xAxisLabel(domain: XAxisDomain): string {
  switch (domain) {
    case "frequency":
      return "Frequency (Hz)";
    case "parameter":
      return "Sweep Parameter";
    default:
      return "Time (s)";
  }
}

/** Derive the ordered list of Y-axis spines for the given signal refs + cache. */
export function buildSpines(refs: SignalRef[], cache: Map<string, WaveformSignal>): SpineSpec[] {
  const seen = new Map<string, SpineSpec>();
  for (const ref of refs) {
    const key = `${ref.simId}::${ref.signalName}`;
    const sig = cache.get(key);

    // In Bode mode, override quantity/unit based on analysis tag.
    let quantity: string;
    let unit: string;
    if (sig?.analysis === "ac_mag") {
      quantity = "dB";
      unit = "dB";
    } else if (sig?.analysis === "ac_phase") {
      quantity = "deg";
      unit = "°";
    } else {
      quantity = sig?.quantity ?? "dimensionless";
      unit = sig?.unit ?? "";
    }

    if (quantity === "dimensionless") continue;
    if (!seen.has(quantity)) {
      const scaleKey = `scale-${quantity}`;
      // Primary (first) spine goes left (side 3); each additional goes right (side 1).
      const side: 0 | 1 | 2 | 3 = seen.size === 0 ? 3 : 1;
      seen.set(quantity, { quantity, unit, scaleKey, side });
    }
  }
  return Array.from(seen.values());
}

/**
 * Adaptively formats time-axis tick labels in ns/µs/ms/s depending on the
 * magnitude of the values currently in view, instead of always rendering
 * raw seconds (which rounds sub-microsecond ticks down to "0").
 */
export function formatTimeTicks(splits: number[]): string[] {
  const maxAbs = Math.max(...splits.map((v) => Math.abs(v)), 0);
  let scale = 1;
  let suffix = "s";
  if (maxAbs !== 0) {
    if (maxAbs < 1e-6) {
      scale = 1e-9;
      suffix = "ns";
    } else if (maxAbs < 1e-3) {
      scale = 1e-6;
      suffix = "µs";
    } else if (maxAbs < 1) {
      scale = 1e-3;
      suffix = "ms";
    }
  }
  return splits.map((v) => {
    const scaled = v / scale;
    const digits = Math.abs(scaled) < 10 ? 2 : Math.abs(scaled) < 100 ? 1 : 0;
    return `${scaled.toFixed(digits)}${suffix}`;
  });
}

/** Build uPlot scales config from spine specs. `logX` applies uPlot's log10 x-distribution. */
export function buildScales(spines: SpineSpec[], logX = false): Record<string, uPlot.Scale> {
  // distr: 3 is uPlot's log10 distribution.
  const xScale: uPlot.Scale = logX ? { time: false, distr: 3 } : { time: false };
  const scales: Record<string, uPlot.Scale> = { x: xScale };
  for (const spine of spines) {
    scales[spine.scaleKey] = {};
  }
  if (spines.length === 0) {
    scales.y = {};
  }
  return scales;
}

/** Build uPlot axes config from spine specs. */
export function buildAxes(spines: SpineSpec[], domain: XAxisDomain = "time"): uPlot.Axis[] {
  const x: uPlot.Axis = { scale: "x", label: xAxisLabel(domain) };
  if (domain === "time") {
    x.values = (_self, splits) => formatTimeTicks(splits as number[]);
  }
  if (spines.length === 0) {
    return [x, { scale: "y" }];
  }
  const yAxes: uPlot.Axis[] = spines.map((spine) => ({
    scale: spine.scaleKey,
    label: spine.unit,
    side: spine.side,
  }));
  return [x, ...yAxes];
}

/** Build uPlot series config for all signal refs. */
export function buildSeries(
  refs: SignalRef[],
  cache: Map<string, WaveformSignal>,
  spines: SpineSpec[],
): uPlot.Series[] {
  const series: uPlot.Series[] = [{}]; // x-axis placeholder
  for (const ref of refs) {
    const cacheKey = `${ref.simId}::${ref.signalName}`;
    const sig = cache.get(cacheKey);
    const quantity = sig?.quantity ?? "dimensionless";
    const spine = spines.find((s) => s.quantity === quantity);
    series.push({
      label: ref.signalName,
      stroke: ref.color,
      scale: spine?.scaleKey ?? "y",
    });
  }
  return series;
}

/**
 * FE-159: hard cap on how many points the *initial full-extent* paint is
 * allowed to process. A single TRAN signal can return 300k+ points (observed
 * in a real run); uPlot's constructor draws every point of every series
 * synchronously on first mount, and with several such signals sharing an
 * axes this froze the tab. Zoomed-in views still render full-resolution
 * data for the visible window (see Axes.tsx) — this only bounds the initial
 * paint before the user has zoomed to anything.
 */
export const MAX_RENDER_POINTS = 20_000;

/**
 * Bucketed min/max decimation: splits [0, values.length) into roughly
 * maxPoints/2 buckets and keeps the index of the local min and max value in
 * each bucket. Preserves visual spikes/peaks, unlike naive stride sampling
 * (which can silently skip over a narrow transient entirely).
 */
function _decimateIndices(values: Float64Array, maxPoints: number): number[] {
  const n = values.length;
  const bucketCount = Math.max(1, Math.floor(maxPoints / 2));
  const bucketSize = n / bucketCount;
  const indices: number[] = [];
  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * bucketSize);
    const end = b === bucketCount - 1 ? n : Math.floor((b + 1) * bucketSize);
    if (start >= end) continue;
    let minIdx = start;
    let maxIdx = start;
    for (let i = start + 1; i < end; i++) {
      const v = values[i] as number;
      if (v < (values[minIdx] as number)) minIdx = i;
      if (v > (values[maxIdx] as number)) maxIdx = i;
    }
    indices.push(minIdx < maxIdx ? minIdx : maxIdx, minIdx < maxIdx ? maxIdx : minIdx);
  }
  indices.sort((a, c) => a - c);
  return indices;
}

function _applyIndices(arr: Float64Array, indices: number[]): Float64Array {
  const out = new Float64Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    out[i] = arr[indices[i] as number] as number;
  }
  return out;
}

/**
 * Decimate one signal's (time, values) pair to at most maxPoints, preserving
 * its own min/max envelope. Standalone/testable; buildAlignedData below uses
 * the lower-level _decimateIndices so every series on an axes shares one
 * index set (they're assumed index-aligned to a common time base — the axes
 * couldn't otherwise share a single uPlot x-scale).
 */
export function decimateMinMax(
  time: Float64Array,
  values: Float64Array,
  maxPoints: number,
): { time: Float64Array; values: Float64Array } {
  if (time.length <= maxPoints || maxPoints < 2) {
    return { time, values };
  }
  const indices = _decimateIndices(values, maxPoints);
  return { time: _applyIndices(time, indices), values: _applyIndices(values, indices) };
}

/** Assemble the AlignedData array for uPlot from refs + cache. */
export function buildAlignedData(
  refs: SignalRef[],
  cache: Map<string, WaveformSignal>,
): uPlot.AlignedData {
  if (refs.length === 0) return [new Float64Array(0)];

  // Use the first cached signal's time vector as the shared x axis.
  let timeArray: Float64Array | null = null;
  let refValues: Float64Array | null = null;
  for (const ref of refs) {
    const key = `${ref.simId}::${ref.signalName}`;
    const sig = cache.get(key);
    if (sig) {
      timeArray = sig.time;
      refValues = sig.values;
      break;
    }
  }
  if (!timeArray) return [new Float64Array(0)];

  // Cap the initial full-extent paint (see MAX_RENDER_POINTS) using a shared
  // index set computed from the reference signal, reapplied to every series
  // on the axes so they stay index-aligned to the same decimated time axis.
  const indices =
    timeArray.length > MAX_RENDER_POINTS && refValues
      ? _decimateIndices(refValues, MAX_RENDER_POINTS)
      : null;

  const data: uPlot.AlignedData = [indices ? _applyIndices(timeArray, indices) : timeArray];
  for (const ref of refs) {
    const key = `${ref.simId}::${ref.signalName}`;
    const sig = cache.get(key);
    const values = sig ? sig.values : new Float64Array(timeArray.length);
    data.push(indices ? _applyIndices(values, indices) : values);
  }
  return data;
}

/**
 * FE-163: a uPlot cursor.bind.mousedown override that pans (grab-and-drag
 * translates the visible x/y window) instead of the default box-zoom drag,
 * whenever getPanMode() returns true at the moment the drag starts. Reads
 * pan mode fresh on every mousedown (via the passed-in getter, backed by a
 * live ref in Axes.tsx) rather than being fixed at chart construction time,
 * so toggling Pan on an already-mounted axes takes effect immediately.
 */
export function makePanAwareMousedown(
  getPanMode: () => boolean | undefined,
  getPrimaryYScaleKey: () => string,
): uPlot.Cursor.MouseListenerFactory {
  return (u, _targ, handler) => (e: MouseEvent) => {
    if (!getPanMode() || e.button !== 0) {
      return handler(e);
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const xMin0 = u.scales.x?.min ?? 0;
    const xMax0 = u.scales.x?.max ?? 1;
    const yKey = getPrimaryYScaleKey();
    const yMin0 = u.scales[yKey]?.min ?? 0;
    const yMax0 = u.scales[yKey]?.max ?? 1;
    const rect = u.over.getBoundingClientRect();

    function onMove(ev: MouseEvent) {
      // Grab-and-drag: content under the cursor follows the cursor.
      const dx = ((ev.clientX - startX) / rect.width) * (xMax0 - xMin0);
      const dy = ((ev.clientY - startY) / rect.height) * (yMax0 - yMin0);
      u.setScale("x", { min: xMin0 - dx, max: xMax0 - dx });
      u.setScale(yKey, { min: yMin0 + dy, max: yMax0 + dy });
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return null;
  };
}

/** Return [t_start, t_end] from the union of all loaded signals for a set of refs. */
export function dataExtents(
  refs: SignalRef[],
  cache: Map<string, WaveformSignal>,
): [number, number] | null {
  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;

  for (const ref of refs) {
    const sig = cache.get(`${ref.simId}::${ref.signalName}`);
    if (!sig || sig.time.length === 0) continue;
    const first = sig.time[0];
    const last = sig.time[sig.time.length - 1];
    if (first !== undefined && first < tMin) tMin = first;
    if (last !== undefined && last > tMax) tMax = last;
  }

  if (!Number.isFinite(tMin) || !Number.isFinite(tMax)) return null;
  return [tMin, tMax];
}

/**
 * Return [min, max] of every signal's *values* (not time) across refs,
 * optionally restricted to points whose time falls within [xMin, xMax].
 * Used by FE-165 (horizontal cursor placement, full range) and FE-166
 * ("Fit Y", windowed to the axes' current visible x-range).
 */
export function valueExtents(
  refs: SignalRef[],
  cache: Map<string, WaveformSignal>,
  xMin?: number,
  xMax?: number,
): [number, number] | null {
  let vMin = Number.POSITIVE_INFINITY;
  let vMax = Number.NEGATIVE_INFINITY;

  for (const ref of refs) {
    const sig = cache.get(`${ref.simId}::${ref.signalName}`);
    if (!sig) continue;
    for (let i = 0; i < sig.values.length; i++) {
      if (xMin !== undefined && xMax !== undefined) {
        const t = sig.time[i];
        if (t === undefined || t < xMin || t > xMax) continue;
      }
      const v = sig.values[i];
      if (v === undefined) continue;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
  }

  if (!Number.isFinite(vMin) || !Number.isFinite(vMax)) return null;
  return [vMin, vMax];
}

/** True when the new refs produce a different spine set than the previous one. */
export function spinesChanged(prev: SpineSpec[], next: SpineSpec[]): boolean {
  if (prev.length !== next.length) return true;
  return prev.some((p, i) => p.quantity !== next[i]?.quantity);
}
