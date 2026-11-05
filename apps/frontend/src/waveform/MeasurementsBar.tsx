import { useCallback, useEffect, useRef, useState } from "react";

import { useWaveformStore } from "../store/waveform";
import { MEASUREMENT_LABELS, type MeasurementKey, type MeasurementResult } from "./measurements";
import type { WorkerRequest } from "./measurements.worker";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RangeMode = "full" | "cursor";

interface MeasurementsBarProps {
  /** The ID of the focused axes whose signals are available for measurement. */
  axesId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEASUREMENT_KEYS = Object.keys(MEASUREMENT_LABELS) as MeasurementKey[];

function _formatValue(result: MeasurementResult): string {
  if (Number.isNaN(result.value)) return "N/A";
  const unit = result.unit ? ` ${result.unit}` : "";
  // Show up to 6 significant figures.
  return `${Number(result.value.toPrecision(6))}${unit}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MeasurementsBar({ axesId }: MeasurementsBarProps) {
  const axes = useWaveformStore((s) => s.axes.get(axesId));
  const signalCache = useWaveformStore((s) => s.signalCache);

  const signals = axes?.signals ?? [];
  const [selectedSignalKey, setSelectedSignalKey] = useState<string>(
    signals.length > 0 ? `${signals[0]?.simId ?? ""}::${signals[0]?.signalName ?? ""}` : "",
  );
  const [measurementKey, setMeasurementKey] = useState<MeasurementKey>("rms");
  const [rangeMode, setRangeMode] = useState<RangeMode>("full");
  const [result, setResult] = useState<MeasurementResult | null>(null);
  const [computing, setComputing] = useState(false);

  // Keep track of current worker so we can terminate stale ones.
  const workerRef = useRef<Worker | null>(null);

  // Determine cursor positions from the focused axes.
  const cursorA = axes?.cursorA;
  const cursorB = axes?.cursorB;
  const bothCursors = cursorA !== undefined && cursorB !== undefined;

  // Effective window: cursor range when mode=cursor and both cursors placed, otherwise full.
  const tStart = rangeMode === "cursor" && bothCursors ? Math.min(cursorA, cursorB) : undefined;
  const tEnd = rangeMode === "cursor" && bothCursors ? Math.max(cursorA, cursorB) : undefined;
  const usingFallback = rangeMode === "cursor" && !bothCursors;

  // If the signals list changes and the selected key is no longer valid, reset.
  useEffect(() => {
    const keys = signals.map((s) => `${s.simId}::${s.signalName}`);
    if (keys.length > 0 && (selectedSignalKey === "" || !keys.includes(selectedSignalKey))) {
      const first = signals[0];
      setSelectedSignalKey(first ? `${first.simId}::${first.signalName}` : "");
    }
  }, [signals, selectedSignalKey]);

  // Run the measurement in a worker whenever inputs change.
  const runMeasurement = useCallback(() => {
    if (selectedSignalKey === "") {
      setResult(null);
      return;
    }

    const signal = signalCache.get(selectedSignalKey);
    if (!signal) {
      setResult(null);
      return;
    }

    // Terminate any previous worker.
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    setComputing(true);

    const worker = new Worker(new URL("./measurements.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    const request: WorkerRequest = {
      time: signal.time,
      values: signal.values,
      key: measurementKey,
      tStart,
      tEnd,
    };

    worker.onmessage = (event: MessageEvent<MeasurementResult>) => {
      setResult(event.data);
      setComputing(false);
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };

    worker.onerror = () => {
      setResult({ value: Number.NaN, unit: "" });
      setComputing(false);
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };

    worker.postMessage(request);
  }, [selectedSignalKey, measurementKey, signalCache, tStart, tEnd]);

  // Re-run whenever inputs change.
  useEffect(() => {
    runMeasurement();
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [runMeasurement]);

  const outputText = computing ? "…" : result !== null ? _formatValue(result) : "—";

  return (
    <section className="measurements-bar" aria-label="Measurements">
      {/* Signal selector */}
      <label className="measurements-bar__label" htmlFor={`mbar-signal-${axesId}`}>
        Signal
      </label>
      <select
        id={`mbar-signal-${axesId}`}
        className="measurements-bar__select"
        value={selectedSignalKey}
        onChange={(e) => setSelectedSignalKey(e.target.value)}
        aria-label="Select signal"
        disabled={signals.length === 0}
      >
        {signals.length === 0 ? (
          <option value="">No signals</option>
        ) : (
          signals.map((s) => {
            const key = `${s.simId}::${s.signalName}`;
            return (
              <option key={key} value={key}>
                {s.signalName}
              </option>
            );
          })
        )}
      </select>

      {/* Measurement type selector */}
      <label className="measurements-bar__label" htmlFor={`mbar-type-${axesId}`}>
        Measurement
      </label>
      <select
        id={`mbar-type-${axesId}`}
        className="measurements-bar__select"
        value={measurementKey}
        onChange={(e) => setMeasurementKey(e.target.value as MeasurementKey)}
        aria-label="Select measurement type"
      >
        {MEASUREMENT_KEYS.map((key) => (
          <option key={key} value={key}>
            {MEASUREMENT_LABELS[key]}
          </option>
        ))}
      </select>

      {/* Range mode toggle */}
      <button
        type="button"
        className={`measurements-bar__range-btn${rangeMode === "cursor" ? " measurements-bar__range-btn--active" : ""}`}
        onClick={() => setRangeMode((prev) => (prev === "full" ? "cursor" : "full"))}
        aria-pressed={rangeMode === "cursor"}
        title={
          usingFallback
            ? "Place both cursors to use cursor window — using full range"
            : rangeMode === "cursor"
              ? "Cursor window active"
              : "Switch to cursor window mode"
        }
      >
        {rangeMode === "full" ? "Full range" : "Cursor window"}
        {usingFallback && (
          <span
            className="measurements-bar__fallback-indicator"
            title="Place both cursors to activate cursor window"
            aria-label="Place both cursors"
          >
            {" "}
            ⚠
          </span>
        )}
      </button>

      {/* Output field */}
      <output
        className="measurements-bar__output"
        aria-label="Measurement result"
        aria-live="polite"
      >
        {outputText}
      </output>
    </section>
  );
}

export default MeasurementsBar;
