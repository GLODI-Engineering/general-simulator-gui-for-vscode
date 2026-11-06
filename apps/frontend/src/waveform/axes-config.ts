import type uPlot from "uplot";

import { CHART_THEME_FALLBACK, type ChartTheme, formatLogTicks, formatTicks } from "./theme";
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
 * Time-axis tick labels in ns/µs/ms/s, chosen from the magnitude currently
 * in view so sub-microsecond ticks do not all round down to "0".
 *
 * Delegates to the shared `formatTicks`, which additionally gives every
 * label on one axis the *same* number of decimals. The hand-rolled version
 * this replaced chose precision per value, so an evenly spaced axis read
 * "5.00ms 10.0ms 15.0ms" — three precisions for three identical steps.
 */
export function formatTimeTicks(splits: number[]): string[] {
  return formatTicks(splits, "s");
}

/** Human axis name for a spine: "Voltage (V)" rather than a bare rotated "V". */
export function spineLabel(spine: SpineSpec): string {
  const QUANTITY_NAMES: Record<string, string> = {
    voltage: "Voltage",
    current: "Current",
    power: "Power",
    energy: "Energy",
    resistance: "Resistance",
    capacitance: "Capacitance",
    inductance: "Inductance",
    temperature: "Temperature",
    frequency: "Frequency",
    angle: "Angle",
    torque: "Torque",
    speed: "Speed",
    force: "Force",
    flow: "Flow",
    pressure: "Pressure",
    dB: "Magnitude",
    deg: "Phase",
  };
  const name = QUANTITY_NAMES[spine.quantity] ?? _titleCase(spine.quantity);
  return spine.unit ? `${name} (${spine.unit})` : name;
}

function _titleCase(raw: string): string {
  const spaced = raw.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * dB and degrees are already the unit, and neither takes an SI prefix: a
 * 0.5 dB tick must read "0.5", never "500m".
 */
function _spineTakesPrefix(spine: SpineSpec): boolean {
  return spine.quantity !== "dB" && spine.quantity !== "deg";
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

/**
 * Build uPlot axes config from spine specs.
 *
 * uPlot paints its axes into the canvas, so every colour and font has to be
 * handed to it explicitly — it cannot inherit the CSS the surrounding legend
 * and header use. `theme` is where they come from (see theme.ts); the
 * defaults keep callers that do not care (unit tests) working.
 *
 * The weights below are deliberate and in one order: the data is the
 * darkest thing on the chart, the border and ticks are lighter, and the grid
 * is lightest of all. Left to its defaults uPlot draws a grid at the same
 * weight as a trace, which is how a plot ends up reading as graph paper
 * with a signal somewhere on it.
 */
/** Width reserved for one y-axis' ticks, in CSS pixels. */
export const Y_AXIS_SIZE = 56;
/** Width reserved for one y-axis' rotated name, in CSS pixels. */
export const Y_LABEL_SIZE = 20;

export function buildAxes(
  spines: SpineSpec[],
  domain: XAxisDomain = "time",
  theme: ChartTheme = CHART_THEME_FALLBACK,
): uPlot.Axis[] {
  const common = {
    space: 44,
    font: theme.font,
    labelFont: theme.labelFont,
    stroke: theme.tickText,
    labelSize: Y_LABEL_SIZE,
    labelGap: 2,
    gap: 6,
    ticks: { show: true, stroke: theme.tick, width: 1, size: 4 },
    grid: { show: true, stroke: theme.grid, width: 1 },
    border: { show: true, stroke: theme.border, width: 1 },
  } satisfies Partial<uPlot.Axis>;

  const x: uPlot.Axis = {
    ...common,
    scale: "x",
    label: xAxisLabel(domain),
    size: 46,
    // Minimum pixels between ticks. uPlot's defaults pack a wide axis with
    // more labels than anyone reads; these give each one room to be read.
    space: 72,
  };
  if (domain === "time") {
    x.values = (_self, splits) => formatTimeTicks(splits as number[]);
  } else if (domain === "frequency") {
    // Decade ticks each carry their own prefix — see formatLogTicks.
    x.values = (_self, splits) => formatLogTicks(splits as number[], "Hz");
  }

  if (spines.length === 0) {
    return [x, { ...common, scale: "y", size: Y_AXIS_SIZE }];
  }

  const yAxes: uPlot.Axis[] = spines.map((spine) => ({
    ...common,
    scale: spine.scaleKey,
    // The unit lives in the axis name ("Voltage (V)"), so the ticks carry
    // only the SI prefix: "0  5m  10m" under "(V)" reads as millivolts
    // without repeating "V" eleven times down the side of the plot.
    label: spineLabel(spine),
    side: spine.side,
    size: Y_AXIS_SIZE,
    values: _spineTakesPrefix(spine)
      ? (_self: uPlot, splits: number[]) => formatTicks(splits)
      : undefined,
  }));
  // Reserve the right-hand gutter even when nothing is drawn in it.
  //
  // Stacked time plots are read by running your eye down a moment in time
  // through all of them, and that only works if their plot areas start and
  // end at the same x. They did not: an axes with one quantity has a left
  // axis only, an axes with two also has a right axis, so the first was
  // wider than the second by the width of an axis and the two time bases
  // were visibly offset. A spacer axis with no ticks, grid, label or values
  // costs the same width and draws nothing.
  if (!yAxes.some((axis) => axis.side === 1)) {
    yAxes.push({
      scale: (spines[0] as SpineSpec).scaleKey,
      side: 1,
      // Ticks *and* name: a real y-axis reserves both, so the spacer has to
      // match the sum or the stack is still off by the width of a name.
      size: Y_AXIS_SIZE + Y_LABEL_SIZE,
      show: true,
      ticks: { show: false },
      grid: { show: false },
      border: { show: false },
      values: () => [],
    });
  }

  return [x, ...yAxes];
}

/** Trace stroke width, in CSS pixels. */
export const SERIES_WIDTH = 1.6;

/**
 * Show per-sample markers only once the samples are far enough apart to be
 * individually meaningful — roughly one every 10 px of plot width.
 */
function _pointsWorthShowing(u: uPlot, seriesIdx: number): boolean {
  const scale = u.series[seriesIdx]?.scale;
  if (!scale) return false;
  const idx = u.series[0]?.idxs;
  if (!idx) return false;
  const visible = idx[1] - idx[0] + 1;
  return visible > 1 && u.bbox.width / devicePixelRatio / visible >= 10;
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
      // 1.6px: heavy enough to stay solid where a switching waveform packs
      // many edges into few pixels, light enough that eight traces on one
      // axes do not merge into a block of colour.
      width: SERIES_WIDTH,
      // A point marker per sample is meaningless at simulation densities —
      // uPlot shows them automatically once zoomed past roughly one sample
      // per 10px, which is exactly where they start to carry information.
      points: { show: (u, seriesIdx) => _pointsWorthShowing(u, seriesIdx) },
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

/**
 * Position, in CSS pixels from the chart's top-left corner, for an overlay
 * element that marks `value` on `scaleKey`.
 *
 * Neither form of `uPlot.valToPos` answers this on its own, which is the
 * trap this helper exists to close:
 *
 *   valToPos(v, k, true)   device pixels, measured from the chart corner
 *   valToPos(v, k, false)  CSS pixels, measured from the *plot area* corner
 *
 * The cursor and annotation overlays are absolutely positioned divs inside
 * the chart, so they need CSS pixels from the chart corner — which is
 * neither. Using `true` (what the code did) put every line at dpr times its
 * correct distance, so on a retina display or at VS Code zoom > 100% they
 * landed outside the plot entirely; using `false` instead drops the axis
 * gutter and shifts every line left by the width of the y-axis.
 *
 * `u.over` is the plot area as a CSS-positioned element, so its offsets are
 * exactly the missing gutter, in the right units, at any pixel ratio.
 */
export function overlayPx(u: uPlot, value: number, scaleKey: string, axis: "x" | "y"): number {
  const inPlot = u.valToPos(value, scaleKey, false);
  return axis === "x" ? u.over.offsetLeft + inPlot : u.over.offsetTop + inPlot;
}
