import { useIpcStore } from "../store/ipc";
import { useWaveformStore } from "../store/waveform";
import { DcOpTable } from "./DcOpTable";
import { FigureManager } from "./FigureManager";
import { SignalBrowser } from "./SignalBrowser";

export function WaveformTab() {
  const hasFigures = useWaveformStore((s) => s.figures.size > 0);
  const dcOpTable = useIpcStore((s) => s.dcOpTable);
  const hasManifest = useIpcStore((s) => s.lastManifest !== null);

  const isEmpty = !hasFigures && !dcOpTable && !hasManifest;

  if (isEmpty) {
    return (
      <div
        className="waveform-empty"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#64748b",
          fontSize: "0.9rem",
        }}
      >
        Run a simulation to view waveforms.
      </div>
    );
  }

  return (
    <div
      className="waveform-tab"
      style={{ display: "flex", height: "100%", minHeight: 0, overflow: "hidden" }}
    >
      {/* Left panel: signal browser lists available signals by sim */}
      <div
        className="waveform-tab__sidebar"
        style={{
          width: "200px",
          flexShrink: 0,
          borderRight: "1px solid #e2e8f0",
          overflowY: "auto",
          background: "#ffffff",
        }}
      >
        <SignalBrowser />
      </div>

      {/* Main area: DC op table (if present) + figure/axes viewer */}
      <div
        className="waveform-tab__main"
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}
      >
        {dcOpTable && (
          <div style={{ flexShrink: 0, maxHeight: "180px", overflowY: "auto" }}>
            <DcOpTable />
          </div>
        )}
        <FigureManager />
      </div>
    </div>
  );
}

export default WaveformTab;
