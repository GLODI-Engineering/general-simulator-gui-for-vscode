import { useWaveformStore } from "../store/waveform";
import { ColorSwatch } from "./ColorSwatch";

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
  const removeSignalFromAxes = useWaveformStore((s) => s.removeSignalFromAxes);

  const signals = axesEntry?.signals ?? [];

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
        return (
          <div key={key} className="axes-legend__row">
            <ColorSwatch
              color={sig.color}
              label={sig.signalName}
              onChange={(color) => setSignalColor(axesId, sig.simId, sig.signalName, color)}
            />
            <span className="axes-legend__name">{sig.signalName}</span>
            {unit && <span className="axes-legend__unit">{unit}</span>}
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
