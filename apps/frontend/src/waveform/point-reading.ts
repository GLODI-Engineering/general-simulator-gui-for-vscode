/**
 * Reading a point off a trace.
 *
 * The one rule that shapes this: values come from the cached samples, never
 * from what is drawn. The chart draws a min/max envelope once a window holds
 * more points than pixels, so a reading taken from the draw buffer would
 * report an envelope bound — a value the signal may never have had at that
 * instant. Display gain is excluded for the same reason it is excluded from
 * measurements: it scales the picture, and a plot must not claim a 2 A
 * current is 20 A.
 */

import { formatValue } from "./theme";
import type { SignalRef, WaveformSignal } from "./types";

export interface PointReading {
  /** The signal's name, as the legend shows it. */
  name: string;
  /** Index into the signal's own samples, not into the drawn buffer. */
  index: number;
  x: number;
  y: number;
  /** Set only for a Bode reading, where one x has two answers. */
  phase?: number;
}

/**
 * Index of the sample nearest `x`, by binary search over a sorted time axis.
 *
 * Returns -1 for an empty signal. Ties go to the earlier sample, which keeps
 * a reading stable when a click lands exactly between two samples.
 */
export function nearestSampleIndex(time: ArrayLike<number>, x: number): number {
  const n = time.length;
  if (n === 0) return -1;
  if (n === 1) return 0;

  let lo = 0;
  let hi = n - 1;
  if (x <= (time[lo] as number)) return lo;
  if (x >= (time[hi] as number)) return hi;

  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((time[mid] as number) <= x) lo = mid;
    else hi = mid;
  }
  const dLo = Math.abs(x - (time[lo] as number));
  const dHi = Math.abs((time[hi] as number) - x);
  return dHi < dLo ? hi : lo;
}

/** Read one trace at the x nearest the one asked for. */
export function readingFor(signal: WaveformSignal, x: number): PointReading | null {
  const index = nearestSampleIndex(signal.time, x);
  if (index < 0) return null;
  const xv = signal.time[index];
  const yv = signal.values[index];
  if (xv === undefined || yv === undefined) return null;
  return { name: signal.name, index, x: xv, y: yv };
}

/**
 * The trace whose sample sits closest to a click, measured in pixels.
 *
 * Distance is computed on screen rather than in data units, because the two
 * axes carry different quantities and often differ by orders of magnitude —
 * "nearest in volts and seconds" is not a distance anybody can see.
 */
export function pickNearestTrace(
  refs: SignalRef[],
  cache: Map<string, WaveformSignal>,
  x: number,
  y: number,
  toPixels: (value: number, axis: "x" | "y", ref: SignalRef) => number,
): PointReading | null {
  let best: PointReading | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const clickX = toPixels(x, "x", refs[0] as SignalRef);

  for (const ref of refs) {
    const signal = cache.get(`${ref.simId}::${ref.signalName}`);
    if (!signal) continue;
    const reading = readingFor(signal, x);
    if (!reading) continue;
    const dx = toPixels(reading.x, "x", ref) - clickX;
    const dy = toPixels(reading.y, "y", ref) - toPixels(y, "y", ref);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = reading;
    }
  }
  return best;
}

/**
 * The line that goes on the clipboard.
 *
 * Tab-separated so it pastes into a spreadsheet as columns, while still
 * reading sensibly on its own. A Bode reading carries both answers, because
 * one frequency has a magnitude *and* a phase and quoting only one of them
 * is how a margin gets misread.
 */
export function formatReading(
  reading: PointReading,
  xUnit: string,
  yUnit: string,
  phaseUnit = "°",
): string {
  const parts = [reading.name, formatValue(reading.x, xUnit), formatValue(reading.y, yUnit)];
  if (reading.phase !== undefined) {
    parts.push(formatValue(reading.phase, phaseUnit));
  }
  return parts.join("\t");
}
