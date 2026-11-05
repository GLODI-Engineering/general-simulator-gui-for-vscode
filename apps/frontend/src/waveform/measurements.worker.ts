/**
 * Web Worker for off-thread waveform measurement computation.
 *
 * Message in:
 *   { time: Float64Array; values: Float64Array; tStart?: number; tEnd?: number; key: MeasurementKey }
 *
 * Message out:
 *   { value: number; unit: string }
 */

import { computeMeasurement } from "./measurements";
import type { MeasurementKey, MeasurementResult } from "./measurements";

export interface WorkerRequest {
  time: Float64Array;
  values: Float64Array;
  tStart?: number;
  tEnd?: number;
  key: MeasurementKey;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { time, values, tStart, tEnd, key } = event.data;
  const result: MeasurementResult = computeMeasurement(key, time, values, tStart, tEnd);
  self.postMessage(result);
};
