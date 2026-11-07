/**
 * The measurement strip above a plot.
 *
 * ## What it replaces
 *
 * There was a `MeasurementsBar` before this one, and a full library of
 * measurement functions behind it — RMS, mean, min, max, peak-to-peak,
 * frequency, period, rise and fall time, duty cycle. None of it was
 * reachable: the component was never mounted anywhere in the app, so every
 * one of those measurements existed, was tested, and could not be used.
 *
 * The old shape was also one measurement at a time, for one signal at a
 * time, chosen from a dropdown. That is not how a plot is read. Reading a
 * converter waveform means wanting the mean *and* the ripple *and* the
 * switching frequency, for every trace on the axes, at a glance — and then
 * occasionally reaching for something unusual.
 *
 * So: a few measurements are shown as columns, every trace gets a row, and
 * the rest of the library is one menu away. Which few is per axes, because
 * what matters on a gate drive (duty cycle, rise time) is not what matters
 * on an output rail (mean, ripple).
 *
 * ## Two things it is careful about
 *
 * **It measures the signal, not the picture.** Display gain scales what is
 * drawn (see GainControl); it must not scale what is reported, or a plot
 * could make a 2 A current read as 20 A. These values come from the cached
 * samples, untouched.
 *
 * **Full range or between the cursors.** A measurement over the whole run
 * is usually the wrong one — the RMS of a waveform that includes its own
 * start-up transient is not the RMS of the steady state. Placing cursors A
 * and B and switching to "A–B" is how that is asked for.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { useWaveformStore } from "../store/waveform";
import { MEASUREMENT_LABELS, type MeasurementKey } from "./measurements";
import { type MeasurementTable, measure } from "./measurements-client";
import { formatValue } from "./theme";
import type { WaveformSignal } from "./types";

/**
 * What a converter waveform is read for, before anyone asks for anything
 * unusual: the DC level, the AC content, and the ripple.
 */
export const DEFAULT_MEASUREMENTS: MeasurementKey[] = ["mean", "rms", "peakToPeak"];

const ALL_MEASUREMENTS = Object.keys(MEASUREMENT_LABELS) as MeasurementKey[];

/** Measurements that answer in seconds, hertz or a ratio, not the signal's unit. */
const OWN_UNIT: Partial<Record<MeasurementKey, string>> = {
  frequency: "Hz",
  period: "s",
  riseTime: "s",
  fallTime: "s",
  dutyCycle: "%",
};

export interface MeasurementsBarProps {
  axesId: string;
}

export function MeasurementsBar({ axesId }: MeasurementsBarProps) {
  const axes = useWaveformStore((s) => s.axes.get(axesId));
  const signalCache = useWaveformStore((s) => s.signalCache);
  const setAxesMeasurements = useWaveformStore((s) => s.setAxesMeasurements);
  const setAxesMeasuredSignals = useWaveformStore((s) => s.setAxesMeasuredSignals);

  const [useCursors, setUseCursors] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [table, setTable] = useState<MeasurementTable>({});
  const requestRef = useRef(0);

  const measurements = axes?.measurements ?? DEFAULT_MEASUREMENTS;

  const signals = useMemo((): WaveformSignal[] => {
    const out: WaveformSignal[] = [];
    for (const ref of axes?.signals ?? []) {
      const signal = signalCache.get(`${ref.simId}::${ref.signalName}`);
      if (signal) out.push(signal);
    }
    return out;
  }, [axes?.signals, signalCache]);

  /** Trace colour per signal, so a row can be matched to its line at a glance. */
  const colorOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const ref of axes?.signals ?? []) {
      map.set(`${ref.simId}::${ref.signalName}`, ref.color);
    }
    return map;
  }, [axes?.signals]);

  const measuredKeys = axes?.measuredSignals ?? [];

  // Only these are measured. Nothing is selected until someone says so, so
  // ticking a measurement costs nothing until it is pointed at a trace.
  const selectedSignals = useMemo(
    () => signals.filter((sig) => measuredKeys.includes(`${sig.simId}::${sig.name}`)),
    // Joined rather than passed as an array: a fresh array each render would
    // re-measure on every render, and the *contents* are what matter here.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above
    [signals, measuredKeys.join("\u0000")],
  );

  const cursorA = axes?.cursorA;
  const cursorB = axes?.cursorB;
  const haveCursors = cursorA !== undefined && cursorB !== undefined;
  const window: [number, number] | undefined =
    useCursors && haveCursors
      ? [Math.min(cursorA, cursorB), Math.max(cursorA, cursorB)]
      : undefined;

  useEffect(() => {
    // A reply that lands after the window has changed again would overwrite
    // a newer answer with an older one, so each request claims a sequence
    // number and only the latest is allowed to win.
    const ticket = ++requestRef.current;
    let cancelled = false;
    if (selectedSignals.length === 0 || measurements.length === 0) {
      setTable({});
      return;
    }
    void measure({ signals: selectedSignals, measurements, ...(window ? { window } : {}) }).then(
      (result) => {
        if (cancelled || ticket !== requestRef.current) return;
        setTable(result);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedSignals, measurements, window?.[0], window?.[1]]);

  if (signals.length === 0) return null;

  function toggleSignal(signalKey: string) {
    const next = measuredKeys.includes(signalKey)
      ? measuredKeys.filter((k) => k !== signalKey)
      : [...measuredKeys, signalKey];
    setAxesMeasuredSignals(axesId, next);
  }

  function toggleMeasurement(key: MeasurementKey) {
    const next = measurements.includes(key)
      ? measurements.filter((m) => m !== key)
      : [...measurements, key];
    setAxesMeasurements(axesId, next);
  }

  function cellText(signal: WaveformSignal, key: MeasurementKey): string {
    const result = table[`${signal.simId}::${signal.name}`]?.[key];
    if (!result) return "…";
    const unit = OWN_UNIT[key] ?? signal.unit;
    if (key === "dutyCycle") {
      return Number.isNaN(result.value) ? "—" : `${(result.value * 100).toPrecision(3)} %`;
    }
    return formatValue(result.value, unit);
  }

  return (
    <div className="measurements-bar">
      <div className="measurements-bar__controls">
        {/* The plot is the subject; the numbers are an annotation on it. An
            axes carrying eight traces would otherwise hand three quarters of
            its height to a table. */}
        <button
          type="button"
          className="measurements-bar__collapse"
          aria-expanded={!collapsed}
          title={collapsed ? "Show measurements" : "Hide measurements"}
          aria-label={collapsed ? "Show measurements" : "Hide measurements"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? "▸" : "▾"}
        </button>
        <div className="measurements-bar__window" role="group" aria-label="Measurement window">
          <button
            type="button"
            className={!useCursors ? "is-active" : ""}
            onClick={() => setUseCursors(false)}
            title="Measure over the whole run"
          >
            Full
          </button>
          <button
            type="button"
            className={useCursors ? "is-active" : ""}
            disabled={!haveCursors}
            onClick={() => setUseCursors(true)}
            title={
              haveCursors
                ? "Measure between cursors A and B"
                : "Place cursors A and B to measure a window"
            }
          >
            A–B
          </button>
        </div>
      </div>

      {/* Two horizontal grids, in the order the question is asked: *which
          measurement*, then *on which trace*. A dropdown held roughly one
          and a half rows before it was clipped by the bar, which made
          choosing from it a scroll through a slot. These are the same list
          laid flat, matching the signal legend above the bar. */}
      <div className="measurements-bar__grid" role="group" aria-label="Measurements">
        {ALL_MEASUREMENTS.map((key) => (
          <label
            key={key}
            className={`measurements-bar__chip${measurements.includes(key) ? " is-on" : ""}`}
          >
            <input
              type="checkbox"
              checked={measurements.includes(key)}
              onChange={() => toggleMeasurement(key)}
            />
            {MEASUREMENT_LABELS[key]}
          </label>
        ))}
      </div>

      <div className="measurements-bar__grid" role="group" aria-label="Signals to measure">
        {signals.map((sig) => {
          const key = `${sig.simId}::${sig.name}`;
          const on = measuredKeys.includes(key);
          return (
            <label key={key} className={`measurements-bar__chip${on ? " is-on" : ""}`}>
              <input type="checkbox" checked={on} onChange={() => toggleSignal(key)} />
              <span
                className="measurements-bar__swatch"
                style={{ background: colorOf.get(key) ?? "#94a3b8" }}
                aria-hidden="true"
              />
              {sig.name}
            </label>
          );
        })}
      </div>

      {collapsed ? (
        <p className="measurements-bar__collapsed-note">
          {selectedSignals.length} of {signals.length} {signals.length === 1 ? "signal" : "signals"}{" "}
          · {measurements.map((key) => MEASUREMENT_LABELS[key]).join(", ")}
        </p>
      ) : selectedSignals.length === 0 ? (
        <p className="measurements-bar__collapsed-note">Tick a signal above to measure it.</p>
      ) : (
        <div className="measurements-bar__scroll">
          <table className="measurements-bar__table">
            <thead>
              <tr>
                <th scope="col">Signal</th>
                {measurements.map((key) => (
                  <th key={key} scope="col">
                    {MEASUREMENT_LABELS[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedSignals.map((signal) => (
                <tr key={`${signal.simId}::${signal.name}`}>
                  <th scope="row">
                    <span
                      className="measurements-bar__swatch"
                      style={{
                        background: colorOf.get(`${signal.simId}::${signal.name}`) ?? "#94a3b8",
                      }}
                      aria-hidden="true"
                    />
                    {signal.name}
                  </th>
                  {measurements.map((key) => (
                    <td key={key}>{cellText(signal, key)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default MeasurementsBar;
