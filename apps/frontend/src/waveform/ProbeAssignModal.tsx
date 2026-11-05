import { useState } from "react";

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
 * Derive the signal name for a probe block from the last simulation manifest.
 * Returns the first manifest signal whose name contains the block_id, or the
 * first signal whose name contains the port_id, or null when no match is found.
 */
function deriveSignalName(blockId: string, portId: string, signals: string[]): string | null {
  // Prefer an exact block-id match.
  const byBlock = signals.find((s) => s.includes(blockId));
  if (byBlock) return byBlock;
  // Fall back to port-id match.
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
  const signalName = hasManifest ? deriveSignalName(blockId, portId, lastManifest.signals) : null;

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
