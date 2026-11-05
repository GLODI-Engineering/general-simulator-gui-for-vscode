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
 */
export function AxesLegend({ axesId }: AxesLegendProps) {
  const axesEntry = useWaveformStore((s) => s.axes.get(axesId));
  const signalCache = useWaveformStore((s) => s.signalCache);
  const setSignalColor = useWaveformStore((s) => s.setSignalColor);
  const removeSignalFromAxes = useWaveformStore((s) => s.removeSignalFromAxes);

  const signals = axesEntry?.signals ?? [];

  if (signals.length === 0) {
    return (
      <div
        className="axes-legend axes-legend--empty"
        style={{ color: "#94a3b8", fontSize: "0.7rem", padding: "2px 6px" }}
      >
        No signals — drag one here, or right-click a signal in the browser.
      </div>
    );
  }

  return (
    <div
      className="axes-legend"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "2px 10px",
        padding: "2px 6px",
        background: "#0f172a",
        borderBottom: "1px solid #1e293b",
      }}
    >
      {signals.map((sig) => {
        const key = `${sig.simId}::${sig.signalName}`;
        const unit = signalCache.get(key)?.unit ?? "";
        return (
          <div
            key={key}
            className="axes-legend__row"
            style={{
              alignItems: "center",
              display: "flex",
              fontSize: "0.7rem",
              gap: "4px",
            }}
          >
            <ColorSwatch
              color={sig.color}
              label={sig.signalName}
              onChange={(color) => setSignalColor(axesId, sig.simId, sig.signalName, color)}
            />
            <span className="axes-legend__name" style={{ color: "#e2e8f0" }}>
              {sig.signalName}
            </span>
            {unit && (
              <span className="axes-legend__unit" style={{ color: "#64748b" }}>
                {unit}
              </span>
            )}
            <button
              type="button"
              className="axes-legend__remove"
              aria-label={`Remove ${sig.signalName}`}
              title={`Remove ${sig.signalName}`}
              onClick={() => removeSignalFromAxes(axesId, sig.simId, sig.signalName)}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                fontSize: "0.75rem",
                lineHeight: 1,
                padding: 0,
              }}
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
