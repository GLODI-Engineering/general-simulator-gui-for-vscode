import { useState } from "react";

import type { Figure } from "./types";

const MAX_GRID = 8;

/**
 * Read a grid count from whatever is currently in the box.
 *
 * Anything that is not a usable number — empty, mid-edit, out of range —
 * reads as `fallback` so the dialog always has a sane value to apply, while
 * the box itself keeps showing exactly what was typed.
 */
export function clampGrid(text: string, fallback: number): number {
  const n = Number(text);
  if (text.trim() === "" || !Number.isFinite(n)) return fallback;
  return Math.min(MAX_GRID, Math.max(1, Math.round(n)));
}

interface FigureSettingsPanelProps {
  figure: Figure;
  onConfirm: (rows: number, cols: number) => void;
  onCancel: () => void;
}

export function FigureSettingsPanel({ figure, onConfirm, onCancel }: FigureSettingsPanelProps) {
  // Held as text while editing, not as a number.
  //
  // Clamping per keystroke destroys the empty string a person must pass
  // through to retype: `Number("")` is 0, `Math.max(1, 0)` is 1, so deleting
  // the digit instantly put it back and the field could never be cleared.
  // The clamp belongs at the moment the value is used, not as it is typed.
  const [rowsText, setRowsText] = useState(String(figure.rows));
  const [colsText, setColsText] = useState(String(figure.cols));
  const rows = clampGrid(rowsText, figure.rows);
  const cols = clampGrid(colsText, figure.cols);
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
          max={MAX_GRID}
          value={rowsText}
          onChange={(e) => setRowsText(e.target.value)}
          onBlur={() => setRowsText(String(rows))}
          className="figure-settings-panel__input"
        />
      </label>
      <label className="figure-settings-panel__field">
        <span>Columns</span>
        <input
          type="number"
          min={1}
          max={MAX_GRID}
          value={colsText}
          onChange={(e) => setColsText(e.target.value)}
          onBlur={() => setColsText(String(cols))}
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
