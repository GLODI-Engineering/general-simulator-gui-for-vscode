/**
 * One measurement worker for the whole viewer, and the bookkeeping that
 * makes it usable from React.
 *
 * A worker per axes would mean a worker per chart and a copy of every
 * signal per chart. One worker, one copy of each signal, keyed by
 * `simId::name` — the same key the signal cache uses.
 *
 * Falls back to computing inline when `Worker` is unavailable (jsdom under
 * vitest, and any host that blocks workers): a measurement that is a little
 * slow is better than a bar that silently shows nothing.
 */
import { type MeasurementKey, type MeasurementResult, computeMeasurement } from "./measurements";
import type { MeasureResponse, WorkerRequest } from "./measurements.worker";
import type { WaveformSignal } from "./types";

export type MeasurementTable = Record<string, Partial<Record<MeasurementKey, MeasurementResult>>>;

export interface MeasureRequest {
  signals: WaveformSignal[];
  measurements: MeasurementKey[];
  window?: [number, number];
}

let worker: Worker | null = null;
let workerBroken = false;
const loaded = new Set<string>();
let nextId = 1;
const pending = new Map<number, (table: MeasurementTable) => void>();

function signalKey(signal: WaveformSignal): string {
  return `${signal.simId}::${signal.name}`;
}

function ensureWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  if (typeof Worker === "undefined") {
    workerBroken = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./measurements.worker.ts", import.meta.url), { type: "module" });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<MeasureResponse>) => {
    const resolve = pending.get(event.data.id);
    if (!resolve) return; // a reply to a request that has since been superseded
    pending.delete(event.data.id);
    resolve(event.data.results);
  };
  worker.onerror = () => {
    // Give up on the worker rather than leaving every future request
    // hanging on a reply that will never come.
    workerBroken = true;
    worker = null;
    loaded.clear();
    for (const [, resolve] of pending) resolve({});
    pending.clear();
  };
  return worker;
}

function computeInline(request: MeasureRequest): MeasurementTable {
  const [from, to] = request.window ?? [];
  const table: MeasurementTable = {};
  for (const signal of request.signals) {
    const perSignal: Partial<Record<MeasurementKey, MeasurementResult>> = {};
    for (const measurement of request.measurements) {
      perSignal[measurement] = computeMeasurement(
        measurement,
        signal.time,
        signal.values,
        from,
        to,
      );
    }
    table[signalKey(signal)] = perSignal;
  }
  return table;
}

export function measure(request: MeasureRequest): Promise<MeasurementTable> {
  if (request.signals.length === 0 || request.measurements.length === 0) {
    return Promise.resolve({});
  }

  const active = ensureWorker();
  if (!active) return Promise.resolve(computeInline(request));

  for (const signal of request.signals) {
    const key = signalKey(signal);
    if (loaded.has(key)) continue;
    // Copied, not transferred: transferring detaches the arrays on this
    // side and the chart would have nothing left to draw.
    const load: WorkerRequest = { type: "load", key, time: signal.time, values: signal.values };
    active.postMessage(load);
    loaded.add(key);
  }

  const id = nextId++;
  return new Promise<MeasurementTable>((resolve) => {
    pending.set(id, resolve);
    const measureMessage: WorkerRequest = {
      type: "measure",
      id,
      keys: request.signals.map(signalKey),
      measurements: request.measurements,
      ...(request.window ? { window: request.window } : {}),
    };
    active.postMessage(measureMessage);
  });
}

/** Forget cached samples — call when a result is replaced by another. */
export function resetMeasurementCache(): void {
  if (worker && loaded.size > 0) {
    const drop: WorkerRequest = { type: "drop", keys: [...loaded] };
    worker.postMessage(drop);
  }
  loaded.clear();
}
