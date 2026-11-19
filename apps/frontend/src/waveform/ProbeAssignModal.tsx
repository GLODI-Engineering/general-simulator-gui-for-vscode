import { useState } from "react";

import type { SignalDetail } from "../ipc/types";
import { useIpcStore } from "../store/ipc";
import { useWaveformStore } from "../store/waveform";
import type { Axes, Figure } from "./types";

// ── Probe-type block detection ────────────────────────────────────────────────

const PROBE_TYPE_PATTERNS = ["probe", "scope", "voltmeter", "ammeter"] as const;

export function isProbeBlockType(blockType: string): boolean {
  const lower = blockType.toLowerCase();
  return PROBE_TYPE_PATTERNS.some((pattern) => lower.includes(pattern));
}

// ── Signal-name derivation ────────────────────────────────────────────────────

/**
 * The signal a probe block produced, from the last run's manifest.
 *
 * The manifest says outright which block and port each signal came from, so
 * when it carries that (`details`), this is a lookup. It used to be a
 * substring search over the names -- the comment on it said "exact block-id
 * match" while the code said `.includes` -- and a search is not a lookup: a
 * block called `C1` matches the signals `C1`, `VC1` and `IC1` alike, and the
 * first of those in list order won. A probe could therefore be assigned a
 * trace belonging to a different block, with nothing on screen to say so.
 *
 * The substring search is kept for a manifest with no details: a fixture, a
 * stub kernel, or a result from an older kernel. It is a guess, and it is only
 * reached when there is nothing better to use.
 */
export function deriveSignalName(
  blockId: string,
  portId: string,
  signals: string[],
  details?: SignalDetail[],
): string | null {
  if (details && details.length > 0) {
    const exact = details.find((d) => d.block === blockId && d.port === portId);
    if (exact) return exact.name;
    // The block, whichever of its ports: a one-output probe is the common
    // case, and the port id a symbol uses need not be the one the engine
    // emitted the signal under.
    const byBlock = details.find((d) => d.block === blockId);
    if (byBlock) return byBlock.name;
    return null;
  }
  const byBlock = signals.find((s) => s.includes(blockId));
  if (byBlock) return byBlock;
  const byPort = signals.find((s) => s.includes(portId));
  if (byPort) return byPort;
  return null;
}

// ── Thumbnail grid cell ───────────────────────────────────────────────────────

function AxesCell({
  axes,
  selected,
  onSelect,
}: {
  axes: Axes;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`probe-assign-modal__axes-cell${selected ? " probe-assign-modal__axes-cell--selected" : ""}`}
      aria-pressed={selected}
      aria-label={`Row ${axes.row + 1}, Col ${axes.col + 1}`}
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: selected ? "2px solid #3b82f6" : "1px solid #334155",
        borderRadius: "4px",
        background: selected ? "#1e3a5f" : "#0f172a",
        color: "#94a3b8",
        fontSize: "11px",
        cursor: "pointer",
        padding: "4px",
        minHeight: "36px",
        outline: "none",
      }}
    >
      {`R${axes.row + 1}C${axes.col + 1}`}
    </button>
  );
}

// ── Figure thumbnail ──────────────────────────────────────────────────────────

function FigureThumbnail({
  figure,
  allAxes,
  selectedAxesId,
  onSelectAxes,
}: {
  figure: Figure;
  allAxes: Map<string, Axes>;
  selectedAxesId: string | null;
  onSelectAxes: (axesId: string) => void;
}) {
  const figureAxes = figure.axesIds
    .map((id) => allAxes.get(id))
    .filter((ax): ax is Axes => ax !== undefined);

  return (
    <div className="probe-assign-modal__figure" style={{ marginBottom: "12px" }}>
      <div
        className="probe-assign-modal__figure-name"
        style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "6px", fontWeight: 600 }}
      >
        {figure.name}
      </div>
      <div
        className="probe-assign-modal__figure-grid"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${figure.cols}, 1fr)`,
          gridTemplateRows: `repeat(${figure.rows}, 1fr)`,
          gap: "4px",
          width: `${Math.min(figure.cols * 56, 240)}px`,
        }}
      >
        {figureAxes.map((ax) => (
          <AxesCell
            key={ax.id}
            axes={ax}
            selected={selectedAxesId === ax.id}
            onSelect={() => onSelectAxes(ax.id)}
          />
        ))}
        {figureAxes.length === 0 && (
          <div style={{ color: "#475569", fontSize: "11px", gridColumn: "1 / -1" }}>
            No axes yet
          </div>
        )}
      </div>
    </div>
  );
}

// ── ProbeAssignModal ──────────────────────────────────────────────────────────

export interface ProbeAssignModalProps {
  blockId: string;
  portId: string;
  onClose: () => void;
}

export function ProbeAssignModal({ blockId, portId, onClose }: ProbeAssignModalProps) {
  const figures = useWaveformStore((s) => s.figures);
  const axes = useWaveformStore((s) => s.axes);
  const createFigure = useWaveformStore((s) => s.createFigure);
  const createAxes = useWaveformStore((s) => s.createAxes);
  const addSignalToAxes = useWaveformStore((s) => s.addSignalToAxes);
  const lastManifest = useIpcStore((s) => s.lastManifest);

  const [selectedAxesId, setSelectedAxesId] = useState<string | null>(null);

  const figureList = Array.from(figures.values());
  const hasManifest = lastManifest !== null;
  const signalName = hasManifest
    ? deriveSignalName(blockId, portId, lastManifest.signals, lastManifest.details)
    : null;

  // ── New Figure handler ────────────────────────────────────────────────────

  function handleNewFigure() {
    const count = figures.size + 1;
    const figId = createFigure(`Figure ${count}`, 1, 1);
    const axId = createAxes(figId, 0, 0, "time");
    setSelectedAxesId(axId);
  }

  // ── Confirm ───────────────────────────────────────────────────────────────

  function handleConfirm() {
    if (!hasManifest || !selectedAxesId || !signalName) return;
    addSignalToAxes(selectedAxesId, lastManifest.sim_id, signalName);
    onClose();
  }

  // ── Keyboard close ────────────────────────────────────────────────────────

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") onClose();
  };

  const confirmDisabled = !hasManifest || !selectedAxesId || !signalName;

  return (
    <div
      className="probe-assign-modal__backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <dialog
        open
        aria-label="Assign probe signal to axes"
        className="probe-assign-modal"
        onKeyDown={handleKeyDown}
        style={{
          background: "var(--surface-bg, #1e293b)",
          borderRadius: "8px",
          padding: "20px 24px",
          minWidth: "320px",
          maxWidth: "480px",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          border: "1px solid #334155",
          color: "inherit",
        }}
      >
        {/* Header */}
        <div style={{ fontWeight: 700, fontSize: "14px", color: "#e2e8f0" }}>
          Assign Probe to Axes
        </div>

        {/* No-manifest warning */}
        {!hasManifest && (
          <div
            role="alert"
            className="probe-assign-modal__no-manifest"
            style={{
              background: "#451a03",
              border: "1px solid #92400e",
              borderRadius: "4px",
              padding: "8px 12px",
              fontSize: "12px",
              color: "#fbbf24",
            }}
          >
            No simulation results yet. Run a simulation before assigning a probe signal.
          </div>
        )}

        {/* Figure list */}
        <div className="probe-assign-modal__figures" style={{ overflowY: "auto", flex: 1 }}>
          {figureList.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: "12px" }}>
              No figures exist. Use <strong>New Figure…</strong> to create one.
            </div>
          ) : (
            figureList.map((figure) => (
              <FigureThumbnail
                key={figure.id}
                figure={figure}
                allAxes={axes}
                selectedAxesId={selectedAxesId}
                onSelectAxes={setSelectedAxesId}
              />
            ))
          )}
        </div>

        {/* New Figure button */}
        <button
          type="button"
          className="probe-assign-modal__new-figure-btn"
          onClick={handleNewFigure}
          style={{
            alignSelf: "flex-start",
            background: "transparent",
            border: "1px dashed #334155",
            borderRadius: "4px",
            padding: "4px 10px",
            fontSize: "12px",
            color: "#94a3b8",
            cursor: "pointer",
          }}
        >
          New Figure…
        </button>

        {/* Footer */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="probe-assign-modal__cancel-btn"
            onClick={onClose}
            style={{
              padding: "6px 14px",
              borderRadius: "4px",
              border: "1px solid #334155",
              background: "transparent",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="probe-assign-modal__confirm-btn"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            aria-disabled={confirmDisabled}
            style={{
              padding: "6px 14px",
              borderRadius: "4px",
              border: "none",
              background: confirmDisabled ? "#334155" : "#3b82f6",
              color: confirmDisabled ? "#64748b" : "#fff",
              cursor: confirmDisabled ? "not-allowed" : "pointer",
              fontSize: "13px",
            }}
          >
            Confirm
          </button>
        </div>
      </dialog>
    </div>
  );
}

export default ProbeAssignModal;
