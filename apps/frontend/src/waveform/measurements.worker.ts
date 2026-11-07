/**
 * Off-thread waveform measurements.
 *
 * ## Why the worker keeps the samples
 *
 * The obvious protocol — send the arrays with every request — costs a
 * structured-clone copy of every sample each time. A 250,000-sample,
 * 11-signal run is 22 MB; copying that on the main thread to avoid blocking
 * the main thread defeats the exercise.
 *
 * So samples are sent once, under a key, and cached here. Afterwards a
 * request is a list of keys, a list of measurements and a window — bytes,
 * not megabytes. They are *copied* rather than transferred on purpose:
 * transferring would detach the arrays on the main thread and leave the
 * chart with nothing to draw.
 *
 * Requests carry an `id` and responses echo it, so a reply that arrives
 * after the user has already changed the window can be recognised as stale
 * and dropped instead of overwriting a newer answer.
 */

import { type MeasurementKey, type MeasurementResult, computeMeasurement } from "./measurements";

export interface LoadMessage {
  type: "load";
  key: string;
  time: Float64Array;
  values: Float64Array;
}

export interface DropMessage {
  type: "drop";
  keys: string[];
}

export interface MeasureMessage {
  type: "measure";
  id: number;
  keys: string[];
  measurements: MeasurementKey[];
  window?: [number, number];
}

export type WorkerRequest = LoadMessage | DropMessage | MeasureMessage;

export interface MeasureResponse {
  type: "measured";
  id: number;
  /** signal key -> measurement key -> result. Missing signals are omitted. */
  results: Record<string, Partial<Record<MeasurementKey, MeasurementResult>>>;
  /** Milliseconds spent computing, for the stress harness to report. */
  elapsedMs: number;
}

const cache = new Map<string, { time: Float64Array; values: Float64Array }>();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "load") {
    cache.set(message.key, { time: message.time, values: message.values });
    return;
  }

  if (message.type === "drop") {
    for (const key of message.keys) cache.delete(key);
    return;
  }

  const started = performance.now();
  const results: MeasureResponse["results"] = {};
  const [from, to] = message.window ?? [];
  for (const key of message.keys) {
    const entry = cache.get(key);
    if (!entry) continue;
    const perSignal: Partial<Record<MeasurementKey, MeasurementResult>> = {};
    for (const measurement of message.measurements) {
      perSignal[measurement] = computeMeasurement(measurement, entry.time, entry.values, from, to);
    }
    results[key] = perSignal;
  }
  const response: MeasureResponse = {
    type: "measured",
    id: message.id,
    results,
    elapsedMs: performance.now() - started,
  };
  self.postMessage(response);
};
