/**
 * The waveform surface's visual contract.
 *
 * uPlot draws its grid, ticks and axis text into a `<canvas>`, so those parts
 * cannot be styled by CSS the way the legend, header and toolbar around them
 * are. Without a shared source of truth the two halves drift: that is how the
 * viewer ended up with a near-black legend bar sitting on a forced-white
 * chart. This module is that source of truth — it reads the same CSS custom
 * properties the DOM uses and hands them to the canvas, so one token change
 * moves both halves together, light theme and dark.
 */

/** Resolved colours and type for one paint of the chart canvas. */
export interface ChartTheme {
  /** Plot area background. */
  background: string;
  /** Axis tick labels. */
  tickText: string;
  /** Axis name ("Time (s)", "Voltage (V)"). */
  axisLabel: string;
  /** Grid lines inside the plot area. */
  grid: string;
  /** The short marks between the plot area and its tick labels. */
  tick: string;
  /** The box around the plot area. */
  border: string;
  font: string;
  labelFont: string;
}

/**
 * uPlot measures text with the canvas 2D context, which needs a concrete
 * font string — it cannot inherit from CSS. Keep these in step with
 * `--wave-font-*` in styles/app.css.
 */
const TICK_FONT = '11px Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
const LABEL_FONT = '600 11px Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

const FALLBACK: ChartTheme = {
  background: "#ffffff",
  tickText: "#64748b",
  axisLabel: "#334155",
  grid: "#eef2f7",
  tick: "#cbd5e1",
  border: "#e2e8f0",
  font: TICK_FONT,
  labelFont: LABEL_FONT,
};

function readVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

/**
 * Resolve the current theme from the document.
 *
 * Called on every chart (re)build rather than cached, because the theme can
 * change under a mounted chart — VS Code switches between a light and a dark
 * colour theme without reloading the webview.
 */
export function readChartTheme(root?: Element): ChartTheme {
  if (typeof globalThis.getComputedStyle !== "function") return FALLBACK;
  const el = root ?? globalThis.document?.documentElement;
  if (!el) return FALLBACK;
  const styles = globalThis.getComputedStyle(el);
  return {
    background: readVar(styles, "--wave-plot-bg", FALLBACK.background),
    tickText: readVar(styles, "--wave-tick-text", FALLBACK.tickText),
    axisLabel: readVar(styles, "--wave-axis-label", FALLBACK.axisLabel),
    grid: readVar(styles, "--wave-grid", FALLBACK.grid),
    tick: readVar(styles, "--wave-tick", FALLBACK.tick),
    border: readVar(styles, "--wave-plot-border", FALLBACK.border),
    font: TICK_FONT,
    labelFont: LABEL_FONT,
  };
}

export const CHART_THEME_FALLBACK = FALLBACK;

// ---------------------------------------------------------------------------
// Engineering notation
// ---------------------------------------------------------------------------

const PREFIXES: Array<{ exp: number; symbol: string }> = [
  { exp: 9, symbol: "G" },
  { exp: 6, symbol: "M" },
  { exp: 3, symbol: "k" },
  { exp: 0, symbol: "" },
  { exp: -3, symbol: "m" },
  { exp: -6, symbol: "µ" },
  { exp: -9, symbol: "n" },
  { exp: -12, symbol: "p" },
  { exp: -15, symbol: "f" },
];

/**
 * The SI prefix to use for a whole axis, chosen from the largest tick.
 *
 * Per-tick prefixes would be worse, not better: an axis reading
 * "500µ 1m 2m" makes the reader convert in their head to compare two
 * neighbouring ticks. One prefix for the whole axis is what an instrument
 * does, and it is why the unit belongs in the axis name rather than on
 * every label.
 */
export function pickPrefix(maxAbs: number): { scale: number; symbol: string } {
  if (!Number.isFinite(maxAbs) || maxAbs === 0) return { scale: 1, symbol: "" };
  for (const { exp, symbol } of PREFIXES) {
    if (maxAbs >= 10 ** exp) return { scale: 10 ** exp, symbol };
  }
  const last = PREFIXES[PREFIXES.length - 1] as { exp: number; symbol: string };
  return { scale: 10 ** last.exp, symbol: last.symbol };
}

/**
 * Format one axis' tick values with a shared SI prefix and a *uniform*
 * number of decimals.
 *
 * Uniform is the point. uPlot's default formatter decides digits per value,
 * which is how an axis ends up reading "5.00ms 10.0ms 15.0ms" — three
 * labels, three different precisions, for three evenly spaced ticks. The
 * step between ticks decides the precision, and every label then uses it.
 */
export function formatTicks(splits: number[], unitSuffix = ""): string[] {
  if (splits.length === 0) return [];
  const maxAbs = Math.max(...splits.map((v) => Math.abs(v)));
  const { scale, symbol } = pickPrefix(maxAbs);
  const suffix = `${symbol}${unitSuffix}`;

  // Precision comes from the gap between ticks, not from each value.
  let step = Number.POSITIVE_INFINITY;
  for (let i = 1; i < splits.length; i++) {
    const gap = Math.abs((splits[i] as number) - (splits[i - 1] as number));
    if (gap > 0 && gap < step) step = gap;
  }
  if (!Number.isFinite(step)) step = maxAbs || 1;
  // Enough decimals to write the *step* exactly, and not one more: a 5 ms
  // step needs none ("0ms 5ms 10ms"), a 0.5 ms step needs one. Deriving this
  // from the magnitude instead (-floor(log10(step))) is wrong for the steps
  // uPlot actually picks: 2.5 would come out as 0 decimals and the axis
  // would read "0 3 5 8 10" — five ticks that are not evenly spaced and two
  // of which are not the value they label.
  const scaledStep = step / scale;
  const decimals = _decimalsFor(scaledStep);

  return splits.map((v) => {
    // Zero drops its prefix when there is no unit for the prefix to
    // qualify: "0ms" alongside "5ms" reads naturally, while a bare "0m"
    // under an axis named "Voltage (V)" reads as a typo. It keeps the
    // axis' decimals either way, so the column of labels stays aligned.
    if (v === 0 && unitSuffix === "") return (0).toFixed(decimals);
    return `${(v / scale).toFixed(decimals)}${suffix}`;
  });
}

/** The fewest decimals that write `step` back exactly, capped at 3. */
function _decimalsFor(step: number): number {
  for (let d = 0; d <= 3; d++) {
    if (Math.abs(step - Number(step.toFixed(d))) < Math.abs(step) * 1e-6) return d;
  }
  return 3;
}

/**
 * Format ticks on a *logarithmic* axis, labelling the decades only.
 *
 * Two things are going on, and both are needed:
 *
 * A shared prefix is wrong here — decade ticks span orders of magnitude by
 * construction, so one prefix turns a clean "10 Hz / 1 kHz / 100 kHz" into
 * "0.00001k / 0.001k / 0.1k". Each tick gets its own.
 *
 * And uPlot hands a log axis every minor tick as well (2, 3, … 9 of each
 * decade), so labelling all of them put nine labels in the space of one and
 * the axis came out as a smear of overlapping text. The minor ticks still
 * get their grid line — that log grid is how a Bode plot is read — they
 * just do not get a label.
 *
 * Inside a single decade there are no decade splits at all, and an axis with
 * no labels is worse than a crowded one, so that case labels everything.
 */
export function formatLogTicks(splits: number[], unitSuffix = ""): string[] {
  const isDecade = (v: number) =>
    v > 0 && Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9;
  const anyDecade = splits.some(isDecade);

  return splits.map((v) => {
    if (v === 0) return `0${unitSuffix}`;
    if (anyDecade && !isDecade(v)) return "";
    const { scale, symbol } = pickPrefix(Math.abs(v));
    const scaled = v / scale;
    const text = Number.isInteger(scaled) ? String(scaled) : scaled.toPrecision(3);
    return `${text}${symbol}${unitSuffix}`;
  });
}

/**
 * Format a single value for a cursor readout or measurement, where there is
 * no axis to share a prefix with so the value carries its own.
 */
export function formatValue(value: number, unit = "", significant = 4): string {
  if (!Number.isFinite(value)) return "—";
  const { scale, symbol } = pickPrefix(Math.abs(value));
  const scaled = value / scale;
  const text = Math.abs(scaled) >= 1000 ? scaled.toExponential(2) : scaled.toPrecision(significant);
  // toPrecision pads with zeros ("1.000"); drop them, keep "1.5".
  const trimmed = text.includes("e") ? text : Number.parseFloat(text).toString();
  return `${trimmed} ${symbol}${unit}`.trimEnd();
}
