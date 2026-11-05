import { useState } from "react";

import type { Figure } from "./types";

interface FigureSettingsPanelProps {
  figure: Figure;
  onConfirm: (rows: number, cols: number) => void;
  onCancel: () => void;
}

export function FigureSettingsPanel({ figure, onConfirm, onCancel }: FigureSettingsPanelProps) {
  const [rows, setRows] = useState(figure.rows);
  const [cols, setCols] = useState(figure.cols);
  const [pendingRows, setPendingRows] = useState<number | null>(null);
  const [pendingCols, setPendingCols] = useState<number | null>(null);
  const [showReductionWarning, setShowReductionWarning] = useState(false);

  const currentAxesCount = figure.axesIds.length;

  function wouldDropAxes(newRows: number, newCols: number): boolean {
    return newRows * newCols < currentAxesCount;
  }

  function handleApply() {
    if (wouldDropAxes(rows, cols)) {
      setPendingRows(rows);
      setPendingCols(cols);
      setShowReductionWarning(true);
      return;
    }
    onConfirm(rows, cols);
  }

  function handleConfirmReduction() {
    if (pendingRows !== null && pendingCols !== null) {
      onConfirm(pendingRows, pendingCols);
    }
    setShowReductionWarning(false);
  }

  function handleCancelReduction() {
    setPendingRows(null);
    setPendingCols(null);
    setShowReductionWarning(false);
  }

  if (showReductionWarning) {
    return (
      <div
        className="figure-settings-panel figure-settings-panel--warning"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm grid reduction"
      >
        <p className="figure-settings-panel__warning-text">
          Reducing the grid to {pendingRows}×{pendingCols} will remove axes that exceed the new
          capacity. This action cannot be undone.
        </p>
        <div className="figure-settings-panel__actions">
          <button
            type="button"
            className="figure-settings-panel__btn figure-settings-panel__btn--danger"
            onClick={handleConfirmReduction}
          >
            Reduce grid
          </button>
          <button
            type="button"
            className="figure-settings-panel__btn"
            onClick={handleCancelReduction}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="figure-settings-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Figure grid settings"
    >
      <h3 className="figure-settings-panel__title">Grid settings — {figure.name}</h3>
      <label className="figure-settings-panel__field">
        <span>Rows</span>
        <input
          type="number"
          min={1}
          max={8}
          value={rows}
          onChange={(e) => setRows(Math.max(1, Number(e.target.value)))}
          className="figure-settings-panel__input"
        />
      </label>
      <label className="figure-settings-panel__field">
        <span>Columns</span>
        <input
          type="number"
          min={1}
          max={8}
          value={cols}
          onChange={(e) => setCols(Math.max(1, Number(e.target.value)))}
          className="figure-settings-panel__input"
        />
      </label>
      <div className="figure-settings-panel__actions">
        <button
          type="button"
          className="figure-settings-panel__btn figure-settings-panel__btn--primary"
          onClick={handleApply}
        >
          Apply
        </button>
        <button type="button" className="figure-settings-panel__btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default FigureSettingsPanel;
