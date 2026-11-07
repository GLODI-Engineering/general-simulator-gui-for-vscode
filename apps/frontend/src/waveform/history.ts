/**
 * Drawing past runs behind the current one.
 *
 * Re-running after changing one component and seeing what moved is the most
 * common thing anyone does with a simulator. The samples of the previous
 * runs are already in the cache; what this adds is the refs that put them on
 * the chart, and the two rules that keep them readable:
 *
 * - **A past trace keeps its signal's colour, and loses contrast with age.**
 *   The thing being compared is one signal across runs, so a different hue
 *   per run would make the eye group by run instead of by signal. Fading is
 *   also the order it should read in: the current run is the subject.
 * - **The label carries how old it is.** "V(out) [1]" is the run before
 *   this one, "[2]" the one before that. Without it, four traces of the
 *   same colour say nothing about which is which.
 *
 * The synthesised refs never enter `Axes.signals`. That holds the user's
 * chosen signals, so adding and removing stays about the signal rather than
 * about which run it came from, and changing the history depth cannot
 * disturb it.
 */
import type { SignalRef, WaveformSignal } from "./types";

/**
 * Opacity of a trace `age` runs old — monotonically decreasing, with a
 * floor.
 *
 * The run before this one stays clearly readable (0.62); each further step
 * recedes; and the floor stops the oldest kept run from fading to the point
 * where it is on the chart but cannot be seen, which is worse than not
 * drawing it.
 */
export function historyOpacity(age: number): number {
  if (age <= 0) return 1;
  return Math.max(0.18, 0.62 ** age);
}

/** Parse "#rrggbb" into its components, or null for anything else. */
function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1] as string, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The same colour, faded by age. Returns the input when it cannot parse it. */
export function fadeForAge(color: string, age: number): string {
  if (age <= 0) return color;
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${historyOpacity(age).toFixed(3)})`;
}

/** The name a trace is shown under: the signal, plus how old the run is. */
export function refLabel(ref: SignalRef): string {
  return ref.age && ref.age > 0 ? `${ref.signalName} [${ref.age}]` : ref.signalName;
}

/**
 * Whether two runs can share one x array.
 *
 * uPlot draws every series of a chart against a single sweep vector, so a
 * run with a different time base genuinely cannot be overlaid — the only
 * ways to force it are to resample, which invents samples that were never
 * computed, or to plot it against the wrong x, which is worse. A run whose
 * step or span changed is therefore left out, and its absence is visible:
 * the legend shows which ages are on the chart, so a missing [2] is
 * something the user can see rather than a trace quietly drawn wrong.
 */
export function sameSweep(present: WaveformSignal, past: WaveformSignal): boolean {
  if (present.time.length !== past.time.length || present.time.length === 0) return false;
  const last = present.time.length - 1;
  const span = Math.abs((present.time[last] as number) - (present.time[0] as number)) || 1;
  const tolerance = span * 1e-9;
  return (
    Math.abs((present.time[0] as number) - (past.time[0] as number)) <= tolerance &&
    Math.abs((present.time[last] as number) - (past.time[last] as number)) <= tolerance
  );
}

/**
 * `refs`, followed by the same signals from up to `depth` previous runs.
 *
 * Current-run traces come first so they are drawn last — uPlot paints
 * series in order, and the run being studied should sit on top of its own
 * history rather than under it.
 */
export function withHistory(
  refs: SignalRef[],
  cache: Map<string, WaveformSignal>,
  runHistory: string[],
  depth: number,
): SignalRef[] {
  if (depth <= 0 || runHistory.length === 0 || refs.length === 0) return refs;

  const out: SignalRef[] = [...refs];
  for (let age = 1; age <= Math.min(depth, runHistory.length); age++) {
    const simId = runHistory[age - 1] as string;
    for (const ref of refs) {
      // Only if that run actually produced this signal. A run from before a
      // probe was added simply has nothing to show for it, which is not an
      // error and should not become a flat line at zero.
      const past = cache.get(`${simId}::${ref.signalName}`);
      const present = cache.get(`${ref.simId}::${ref.signalName}`);
      if (!past || !present || !sameSweep(present, past)) continue;
      out.push({
        simId,
        signalName: ref.signalName,
        color: fadeForAge(ref.color, age),
        age,
        ...(ref.gain === undefined ? {} : { gain: ref.gain }),
      });
    }
  }
  return out;
}
