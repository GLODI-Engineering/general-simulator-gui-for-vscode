import { useEffect, useMemo, useRef, useState } from "react";
import { AnalysisPanel } from "../simulation/AnalysisPanel";
import { useIpcStore } from "../store";
import { useSimSettingsStore } from "../store/sim-settings";
import { useWaveformStore } from "../store/waveform";
import { ActiveTabToolbar } from "./ActiveTabToolbar";
import {
  Btn,
  FilePlusIcon,
  FolderOpenIcon,
  PlayIcon,
  SaveIcon,
  Sep,
  ShapesIcon,
  StopIcon,
  attachHorizontalWheelScroll,
} from "./ToolbarControls";
import { triggerCancel, triggerRun } from "./run";

// ── Time formatting ───────────────────────────────────────────────────────────

function formatSimTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds >= 1) return `${+seconds.toPrecision(3)}s`;
  if (seconds >= 1e-3) return `${+(seconds * 1e3).toPrecision(3)}ms`;
  if (seconds >= 1e-6) return `${+(seconds * 1e6).toPrecision(3)}µs`;
  return `${+(seconds * 1e9).toPrecision(3)}ns`;
}

/**
 * The single, always-visible toolbar row: File actions and Run/Stop +
 * simulation status first, followed by whichever tab-specific segment
 * ActiveTabToolbar.tsx renders for the active editor tab (e.g.
 * canvas/SchematicToolbar.tsx's zoom/clipboard/components/transforms for
 * the Schematic tab) — all in this one row, exactly where the toolbar has
 * always lived (directly below TopBar, above the sidebars/canvas). Tabs
 * with no registered toolbar (Waveforms, Netlist) just get the File/Run
 * segment.
 */
export interface MainToolbarProps {
  onAction: (actionId: string) => void;
}

export function MainToolbar({ onAction }: MainToolbarProps) {
  const status = useIpcStore((state) => state.status);
  const simProgress = useIpcStore((state) => state.simProgress);
  const lastManifest = useIpcStore((state) => state.lastManifest);
  const signalCache = useWaveformStore((state) => state.signalCache);
  const tEnd = useSimSettingsStore((state) => state.settings.tEnd);

  const [simDialogOpen, setSimDialogOpen] = useState(false);

  const toolbarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => attachHorizontalWheelScroll(toolbarRef.current), []);

  const busy = status === "busy" || simProgress !== null;

  // FE-155: the current simulated time, not wall-clock elapsed time — read
  // from the live-streamed waveform_chunk data (FE-154) already cached for
  // the in-progress run's signals, which reflects genuine solver progress
  // through the TRAN sweep. Falls back to frac * t_end (the backend's
  // heartbeat progress estimate) until the first chunk arrives, or for
  // analyses that don't stream live (AC/DC/OP).
  const currentSimTime = useMemo(() => {
    if (lastManifest) {
      let maxT = 0;
      for (const [key, signal] of signalCache) {
        if (!key.startsWith(`${lastManifest.sim_id}::`) || signal.time.length === 0) continue;
        const last = signal.time[signal.time.length - 1];
        if (last !== undefined && last > maxT) maxT = last;
      }
      if (maxT > 0) return maxT;
    }
    return simProgress !== null ? simProgress * tEnd : 0;
  }, [lastManifest, signalCache, simProgress, tEnd]);

  return (
    <div
      ref={toolbarRef}
      className="gs-toolbar main-toolbar"
      role="toolbar"
      aria-label="Main toolbar"
    >
      {/* ── File ── */}
      <Btn title="New  Ctrl+N" label="New" onClick={() => onAction("file.new")}>
        <FilePlusIcon />
      </Btn>
      <Btn title="Open  Ctrl+O" label="Open" onClick={() => onAction("file.open")}>
        <FolderOpenIcon />
      </Btn>
      <Btn title="Save  Ctrl+S" label="Save" onClick={() => onAction("file.save")}>
        <SaveIcon />
      </Btn>
      <Btn title="New Symbol" label="Symbol" onClick={() => onAction("symbol.new")}>
        <ShapesIcon />
      </Btn>

      <Sep />

      {/* ── Simulation ── */}
      <Btn
        title={busy ? "Stop simulation  F5" : "Run simulation  F5"}
        label={busy ? "Stop" : "Run"}
        active={busy}
        danger={busy}
        onClick={() => (busy ? triggerCancel() : void triggerRun())}
      >
        {busy ? <StopIcon /> : <PlayIcon />}
      </Btn>
      {busy ? (
        <div className="main-toolbar__sim-status" aria-live="polite">
          <div className="main-toolbar__sim-status-row">
            <span className="main-toolbar__spinner" />
            {simProgress !== null ? (
              <div
                className="main-toolbar__progress"
                role="meter"
                aria-valuenow={Math.round(simProgress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Simulation progress"
                title={`${Math.round(simProgress * 100)}%`}
              >
                <div
                  className="main-toolbar__progress-fill"
                  style={{ width: `${Math.round(simProgress * 100)}%` }}
                />
              </div>
            ) : null}
          </div>
          <span className="main-toolbar__sim-times" title="Current / final simulated time">
            {formatSimTime(currentSimTime)} / {formatSimTime(tEnd)}
          </span>
        </div>
      ) : (
        <button
          type="button"
          className="main-toolbar__sim-time"
          title="Analyses and initial conditions"
          aria-label="Simulation"
          onClick={() => setSimDialogOpen(true)}
        >
          Simulation
        </button>
      )}

      {simDialogOpen ? (
        <div className="sim-settings-backdrop" onMouseDown={() => setSimDialogOpen(false)}>
          <div className="sim-settings-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <AnalysisPanel onClose={() => setSimDialogOpen(false)} />
          </div>
        </div>
      ) : null}

      <ActiveTabToolbar onAction={onAction} />
    </div>
  );
}

export default MainToolbar;
