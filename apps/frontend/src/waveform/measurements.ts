/** Pure TypeScript measurement functions for time-domain waveform analysis. */

export interface MeasurementResult {
  value: number;
  unit: string;
}

/**
 * Slice the time and values arrays to the window [tStart, tEnd].
 * Returns the original arrays when the window covers the full range.
 */
function _slice(
  time: Float64Array,
  values: Float64Array,
  tStart: number,
  tEnd: number,
): { time: Float64Array; values: Float64Array } {
  let iStart = 0;
  let iEnd = time.length - 1;
  for (let i = 0; i < time.length; i++) {
    const t = time[i];
    if (t === undefined) continue;
    if (t >= tStart) {
      iStart = i;
      break;
    }
  }
  for (let i = time.length - 1; i >= 0; i--) {
    const t = time[i];
    if (t === undefined) continue;
    if (t <= tEnd) {
      iEnd = i;
      break;
    }
  }
  if (iStart === 0 && iEnd === time.length - 1) {
    return { time, values };
  }
  return {
    time: time.slice(iStart, iEnd + 1),
    values: values.slice(iStart, iEnd + 1),
  };
}

export function measureRms(
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): MeasurementResult {
  const { values: v } = _windowedArrays(time, values, tStart, tEnd);
  if (v.length === 0) return { value: Number.NaN, unit: "" };
  let sumSq = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i] ?? 0;
    sumSq += x * x;
  }
  return { value: Math.sqrt(sumSq / v.length), unit: "" };
}

export function measureMean(
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): MeasurementResult {
  const { values: v } = _windowedArrays(time, values, tStart, tEnd);
  if (v.length === 0) return { value: Number.NaN, unit: "" };
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] ?? 0;
  }
  return { value: sum / v.length, unit: "" };
}

export function measureMin(
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): MeasurementResult {
  const { values: v } = _windowedArrays(time, values, tStart, tEnd);
  if (v.length === 0) return { value: Number.NaN, unit: "" };
  let min = v[0] ?? 0;
  for (let i = 1; i < v.length; i++) {
    const x = v[i] ?? 0;
    if (x < min) min = x;
  }
  return { value: min, unit: "" };
}

export function measureMax(
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): MeasurementResult {
  const { values: v } = _windowedArrays(time, values, tStart, tEnd);
  if (v.length === 0) return { value: Number.NaN, unit: "" };
  let max = v[0] ?? 0;
  for (let i = 1; i < v.length; i++) {
    const x = v[i] ?? 0;
    if (x > max) max = x;
  }
  return { value: max, unit: "" };
}

export function measurePeakToPeak(
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): MeasurementResult {
  const minResult = measureMin(time, values, tStart, tEnd);
  const maxResult = measureMax(time, values, tStart, tEnd);
  return { value: maxResult.value - minResult.value, unit: "" };
}

export function measureFrequency(
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): MeasurementResult {
  const { time: t, values: v } = _windowedArrays(time, values, tStart, tEnd);
  if (t.length < 2) return { value: Number.NaN, unit: "Hz" };

  const tFirst = t[0] ?? 0;
  const tLast = t[t.length - 1] ?? 0;
  const totalTime = tLast - tFirst;
  if (totalTime <= 0) return { value: Number.NaN, unit: "Hz" };

  // Count rising zero-crossings (positive-going).
  let crossings = 0;
  const mean = measureMean(time, values, tStart, tEnd).value;
  for (let i = 1; i < v.length; i++) {
    const prev = (v[i - 1] ?? 0) - mean;
    const curr = (v[i] ?? 0) - mean;
    if (prev < 0 && curr >= 0) crossings++;
  }
  if (crossings === 0) return { value: 0, unit: "Hz" };
  return { value: crossings / totalTime, unit: "Hz" };
}

export function measurePeriod(
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): MeasurementResult {
  const freq = measureFrequency(time, values, tStart, tEnd);
  if (freq.value === 0 || Number.isNaN(freq.value)) return { value: Number.NaN, unit: "s" };
  return { value: 1 / freq.value, unit: "s" };
}

export function measureRiseTime(
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): MeasurementResult {
  const { time: t, values: v } = _windowedArrays(time, values, tStart, tEnd);
  if (t.length < 2) return { value: Number.NaN, unit: "s" };

  let vMin = v[0] ?? 0;
  let vMax = v[0] ?? 0;
  for (let i = 1; i < v.length; i++) {
    const x = v[i] ?? 0;
    if (x < vMin) vMin = x;
    if (x > vMax) vMax = x;
  }
  const range = vMax - vMin;
  if (range === 0) return { value: Number.NaN, unit: "s" };

  const low = vMin + range * 0.1;
  const high = vMin + range * 0.9;

  // Find the first rising edge: crossing 10% threshold going up.
  let t10 = Number.NaN;
  let t90 = Number.NaN;

  for (let i = 1; i < v.length; i++) {
    const prev = v[i - 1] ?? 0;
    const curr = v[i] ?? 0;
    const tPrev = t[i - 1] ?? 0;
    const tCurr = t[i] ?? 0;

    if (Number.isNaN(t10) && prev < low && curr >= low) {
      // Linear interpolation.
      const frac = (low - prev) / (curr - prev);
      t10 = tPrev + frac * (tCurr - tPrev);
    }
    if (!Number.isNaN(t10) && Number.isNaN(t90) && prev < high && curr >= high) {
      const frac = (high - prev) / (curr - prev);
      t90 = tPrev + frac * (tCurr - tPrev);
      break;
    }
  }

  if (Number.isNaN(t10) || Number.isNaN(t90)) return { value: Number.NaN, unit: "s" };
  return { value: t90 - t10, unit: "s" };
}

export function measureFallTime(
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): MeasurementResult {
  const { time: t, values: v } = _windowedArrays(time, values, tStart, tEnd);
  if (t.length < 2) return { value: Number.NaN, unit: "s" };

  let vMin = v[0] ?? 0;
  let vMax = v[0] ?? 0;
  for (let i = 1; i < v.length; i++) {
    const x = v[i] ?? 0;
    if (x < vMin) vMin = x;
    if (x > vMax) vMax = x;
  }
  const range = vMax - vMin;
  if (range === 0) return { value: Number.NaN, unit: "s" };

  const low = vMin + range * 0.1;
  const high = vMin + range * 0.9;

  // Find the first falling edge: crossing 90% threshold going down.
  let t90 = Number.NaN;
  let t10 = Number.NaN;

  for (let i = 1; i < v.length; i++) {
    const prev = v[i - 1] ?? 0;
    const curr = v[i] ?? 0;
    const tPrev = t[i - 1] ?? 0;
    const tCurr = t[i] ?? 0;

    if (Number.isNaN(t90) && prev >= high && curr < high) {
      const frac = (prev - high) / (prev - curr);
      t90 = tPrev + frac * (tCurr - tPrev);
    }
    if (!Number.isNaN(t90) && Number.isNaN(t10) && prev >= low && curr < low) {
      const frac = (prev - low) / (prev - curr);
      t10 = tPrev + frac * (tCurr - tPrev);
      break;
    }
  }

  if (Number.isNaN(t90) || Number.isNaN(t10)) return { value: Number.NaN, unit: "s" };
  return { value: t10 - t90, unit: "s" };
}

export function measureDutyCycle(
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): MeasurementResult {
  const { time: t, values: v } = _windowedArrays(time, values, tStart, tEnd);
  if (t.length < 2) return { value: Number.NaN, unit: "" };

  let vMin = v[0] ?? 0;
  let vMax = v[0] ?? 0;
  for (let i = 1; i < v.length; i++) {
    const x = v[i] ?? 0;
    if (x < vMin) vMin = x;
    if (x > vMax) vMax = x;
  }
  const threshold = vMin + (vMax - vMin) / 2;

  // Time-weighted integration: use trapezoidal rule proportional fraction above threshold.
  const tFirst = t[0] ?? 0;
  const tLast = t[t.length - 1] ?? 0;
  const totalTime = tLast - tFirst;
  if (totalTime <= 0) return { value: Number.NaN, unit: "" };

  let timeAbove = 0;
  for (let i = 1; i < t.length; i++) {
    const tPrev = t[i - 1] ?? 0;
    const tCurr = t[i] ?? 0;
    const dt = tCurr - tPrev;
    const vPrev = v[i - 1] ?? 0;
    const vCurr = v[i] ?? 0;

    const prevAbove = vPrev > threshold;
    const currAbove = vCurr > threshold;

    if (prevAbove && currAbove) {
      timeAbove += dt;
    } else if (prevAbove && !currAbove) {
      // Falling crossing: fraction of dt spent above.
      const frac = (vPrev - threshold) / (vPrev - vCurr);
      timeAbove += frac * dt;
    } else if (!prevAbove && currAbove) {
      // Rising crossing: fraction of dt spent above.
      const frac = (threshold - vPrev) / (vCurr - vPrev);
      timeAbove += (1 - frac) * dt;
    }
  }

  return { value: timeAbove / totalTime, unit: "" };
}

// ---------------------------------------------------------------------------
// Internal helper — windowed slice when tStart/tEnd are provided.
// ---------------------------------------------------------------------------

function _windowedArrays(
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): { time: Float64Array; values: Float64Array } {
  if (tStart === undefined || tEnd === undefined) return { time, values };
  return _slice(time, values, tStart, tEnd);
}

// ---------------------------------------------------------------------------
// Dispatch helper used by the worker.
// ---------------------------------------------------------------------------

export type MeasurementKey =
  | "rms"
  | "mean"
  | "min"
  | "max"
  | "peakToPeak"
  | "frequency"
  | "period"
  | "riseTime"
  | "fallTime"
  | "dutyCycle";

export const MEASUREMENT_LABELS: Record<MeasurementKey, string> = {
  rms: "RMS",
  mean: "Mean",
  min: "Min",
  max: "Max",
  peakToPeak: "Peak-to-peak",
  frequency: "Frequency",
  period: "Period",
  riseTime: "Rise time",
  fallTime: "Fall time",
  dutyCycle: "Duty cycle",
};

export function computeMeasurement(
  key: MeasurementKey,
  time: Float64Array,
  values: Float64Array,
  tStart?: number,
  tEnd?: number,
): MeasurementResult {
  switch (key) {
    case "rms":
      return measureRms(time, values, tStart, tEnd);
    case "mean":
      return measureMean(time, values, tStart, tEnd);
    case "min":
      return measureMin(time, values, tStart, tEnd);
    case "max":
      return measureMax(time, values, tStart, tEnd);
    case "peakToPeak":
      return measurePeakToPeak(time, values, tStart, tEnd);
    case "frequency":
      return measureFrequency(time, values, tStart, tEnd);
    case "period":
      return measurePeriod(time, values, tStart, tEnd);
    case "riseTime":
      return measureRiseTime(time, values, tStart, tEnd);
    case "fallTime":
      return measureFallTime(time, values, tStart, tEnd);
    case "dutyCycle":
      return measureDutyCycle(time, values, tStart, tEnd);
    default: {
      const _exhaustive: never = key;
      return { value: Number.NaN, unit: "" };
    }
  }
}
