import { useEffect, useState } from "react";

import { useWaveformStore } from "../store/waveform";
import { FigureSettingsPanel } from "./FigureSettingsPanel";
import { FigureTab } from "./FigureTab";
import { GridLayout } from "./GridLayout";

const DEFAULT_ROWS = 1;
const DEFAULT_COLS = 1;

export function FigureManager() {
  const figures = useWaveformStore((s) => s.figures);
  const createFigure = useWaveformStore((s) => s.createFigure);
  const deleteFigure = useWaveformStore((s) => s.deleteFigure);
  const renameFigure = useWaveformStore((s) => s.renameFigure);
  const resizeFigure = useWaveformStore((s) => s.resizeFigure);

  const [activeFigureId, setActiveFigureId] = useState<string | null>(null);

  // Keep activeFigureId pointed at a real figure. The lazy useState
  // initializer this replaced only ran once at mount — typically before any
  // simulation had run, so figures was empty and activeFigureId stayed null
  // forever. When Run later created the "Simulation" figure, nothing here
  // re-selected it: the tab bar showed it, but the "No figures" empty state
  // stayed up and GridLayout (and every real uPlot instance under it) never
  // mounted until the user manually clicked the tab — making that click the
  // *first* time all the run's accumulated signal data got processed at
  // once, instead of that cost landing right after Run like the user would
  // expect. Auto-selects whenever there's no valid current selection.
  useEffect(() => {
    if (activeFigureId && figures.has(activeFigureId)) return;
    const first = figures.keys().next();
    setActiveFigureId(first.done ? null : first.value);
  }, [figures, activeFigureId]);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [settingsFigureId, setSettingsFigureId] = useState<string | null>(null);

  const figureList = Array.from(figures.values());
  const activeFigure = activeFigureId ? figures.get(activeFigureId) : null;

  function handleNewFigure() {
    const count = figures.size + 1;
    const id = createFigure(`Figure ${count}`, DEFAULT_ROWS, DEFAULT_COLS);
    setActiveFigureId(id);
  }

  function handleDeleteRequest(id: string) {
    setDeleteTargetId(id);
  }

  function handleConfirmDelete() {
    if (!deleteTargetId) return;
    deleteFigure(deleteTargetId);
    if (activeFigureId === deleteTargetId) {
      // Activate the first remaining figure, if any.
      const remaining = Array.from(figures.keys()).filter((k) => k !== deleteTargetId);
      setActiveFigureId(remaining[0] ?? null);
    }
    setDeleteTargetId(null);
  }

  function handleCancelDelete() {
    setDeleteTargetId(null);
  }

  function handleSettingsConfirm(rows: number, cols: number) {
    if (!settingsFigureId) return;
    resizeFigure(settingsFigureId, rows, cols);
    setSettingsFigureId(null);
  }

  return (
    <div
      className="figure-manager"
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
    >
      {/* Tab bar */}
      <div
        className="figure-manager__tabbar"
        role="tablist"
        aria-label="Figures"
        style={{ display: "flex", alignItems: "center", gap: "2px", padding: "4px 8px" }}
      >
        {figureList.map((figure) => (
          <FigureTab
            key={figure.id}
            id={figure.id}
            name={figure.name}
            isActive={figure.id === activeFigureId}
            onActivate={() => setActiveFigureId(figure.id)}
            onRename={(newName) => renameFigure(figure.id, newName)}
            onDeleteRequest={() => handleDeleteRequest(figure.id)}
          />
        ))}
        <button
          type="button"
          className="figure-manager__new-btn"
          onClick={handleNewFigure}
          title="New Figure"
          aria-label="New Figure"
          style={{ marginLeft: "4px" }}
        >
          + New Figure
        </button>
        {activeFigure && (
          <button
            type="button"
            className="figure-manager__settings-btn"
            onClick={() => setSettingsFigureId(activeFigureId)}
            title="Figure grid settings"
            aria-label="Figure grid settings"
            style={{ marginLeft: "auto" }}
          >
            ⚙
          </button>
        )}
      </div>

      {/* Grid content */}
      {activeFigure && activeFigureId ? (
        <GridLayout figureId={activeFigureId} rows={activeFigure.rows} cols={activeFigure.cols} />
      ) : (
        <div className="figure-manager__empty">
          No figures. Click <strong>+ New Figure</strong> to create one.
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTargetId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm figure deletion"
          className="figure-manager__dialog-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="figure-manager__dialog"
            style={{
              background: "var(--surface-bg, #1e293b)",
              padding: "24px",
              borderRadius: "8px",
              maxWidth: "360px",
            }}
          >
            <p>
              Delete figure <strong>{figures.get(deleteTargetId)?.name}</strong>? This cannot be
              undone.
            </p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="figure-manager__dialog-cancel"
                onClick={handleCancelDelete}
              >
                Cancel
              </button>
              <button
                type="button"
                className="figure-manager__dialog-confirm"
                onClick={handleConfirmDelete}
                style={{ color: "#ef4444" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {settingsFigureId && figures.get(settingsFigureId) && (
        <div
          className="figure-manager__dialog-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <FigureSettingsPanel
            figure={figures.get(settingsFigureId)!}
            onConfirm={handleSettingsConfirm}
            onCancel={() => setSettingsFigureId(null)}
          />
        </div>
      )}
    </div>
  );
}

export default FigureManager;
