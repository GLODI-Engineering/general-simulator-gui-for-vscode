import { useState } from "react";

import { useWaveformStore } from "../store/waveform";
import { ColorSwatch } from "./ColorSwatch";
import { GainControl } from "./GainControl";
import { historyOpacity, withHistory } from "./history";

export interface AxesLegendProps {
  axesId: string;
}

/**
 * FE-162: a real per-axes legend — color swatch (editable via FE-161's
 * ColorSwatch), name, unit, and a remove button per signal. Replaces
 * reliance on uPlot's bare built-in legend (no color editing, no remove)
 * and the unused SignalLegend.tsx (dead code, never wired up).
 *
 * Styling lives in styles/app.css under the `--wave-*` tokens. It used to be
 * inline, and near-black (`#0f172a`) on a chart forced to white — a heavy
 * dark strip laid across every plot, and the single loudest thing on the
 * surface. A legend names the traces; it should not out-weigh them.
 */
export function AxesLegend({ axesId }: AxesLegendProps) {
  const axesEntry = useWaveformStore((s) => s.axes.get(axesId));
  const signalCache = useWaveformStore((s) => s.signalCache);
  const setSignalColor = useWaveformStore((s) => s.setSignalColor);
  const setSignalGain = useWaveformStore((s) => s.setSignalGain);
  const removeSignalFromAxes = useWaveformStore((s) => s.removeSignalFromAxes);
  const [editingGain, setEditingGain] = useState<string | null>(null);

  const runHistory = useWaveformStore((s) => s.runHistory);
  const ownSignals = axesEntry?.signals ?? [];
  // The legend lists what is drawn, history included — otherwise four
  // traces of one colour appear with one name between them.
  const signals = withHistory(ownSignals, signalCache, runHistory, axesEntry?.historyDepth ?? 0);

  if (signals.length === 0) {
    return (
      <div className="axes-legend axes-legend--empty">
        No signals — drag one here, or right-click a signal in the browser.
      </div>
    );
  }

  return (
    <div className="axes-legend">
      {signals.map((sig) => {
        const key = `${sig.simId}::${sig.signalName}`;
        const unit = signalCache.get(key)?.unit ?? "";
        const age = sig.age ?? 0;
        if (age > 0) {
          // A past run's trace is derived from the current one's — there is
          // nothing here to recolour, rescale or remove on its own, so the
          // row is a swatch, a name and how old it is.
          return (
            <div key={`${key}::${age}`} className="axes-legend__row axes-legend__row--past">
              <span
                className="axes-legend__past-swatch"
                style={{ background: sig.color, opacity: historyOpacity(age) }}
                aria-hidden="true"
              />
              <span className="axes-legend__name">{sig.signalName}</span>
              <span
                className="axes-legend__age"
                title={`${age} ${age === 1 ? "run" : "runs"} before the current one`}
              >
                [{age}]
              </span>
            </div>
          );
        }
        return (
          <div key={key} className="axes-legend__row">
            <ColorSwatch
              color={sig.color}
              label={sig.signalName}
              onChange={(color) => setSignalColor(axesId, sig.simId, sig.signalName, color)}
            />
            <span className="axes-legend__name">{sig.signalName}</span>
            {unit && <span className="axes-legend__unit">{unit}</span>}
            {/* The gain chip is always rendered once a gain is set, and only
                on hover otherwise. A scaled trace must never be able to pass
                for an unscaled one, so "×10" is not something the user can
                lose by moving the mouse away. */}
            <GainControl
              gain={sig.gain}
              signalName={sig.signalName}
              editing={editingGain === key}
              onEdit={() => setEditingGain(key)}
              onCommit={(value) => {
                setSignalGain(axesId, sig.simId, sig.signalName, value);
                setEditingGain(null);
              }}
              onCancel={() => setEditingGain(null)}
            />
            <button
              type="button"
              className="axes-legend__remove"
              aria-label={`Remove ${sig.signalName}`}
              title={`Remove ${sig.signalName}`}
              onClick={() => removeSignalFromAxes(axesId, sig.simId, sig.signalName)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default AxesLegend;
