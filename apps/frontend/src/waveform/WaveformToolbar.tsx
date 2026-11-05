/**
 * WaveformToolbar — zoom, zoom-to-fit, pan, cursor A/B controls for one axes,
 * plus an Export Figure button that opens ExportDialog.
 *
 * Zoom In  : halves the visible time window centred on the current midpoint.
 * Zoom Out : doubles the visible time window (clamped to data extents).
 * Fit X    : resets xMin/xMax to the t_start/t_end of loaded signals.
 * Fit Y    : resets yMin/yMax to the value range of loaded signals within
 *            the current visible x-window (FE-166) — independent of Fit X.
 * Pan      : toggles panMode on the axes (pointer becomes a hand).
 * Cursor A : next click on the plot sets cursorA (vertical/time) in the waveform store.
 * Cursor B : same for cursorB.
 * H-Cursor A/B : next click sets cursorAH/cursorBH (horizontal/value) — FE-165.
 * Clear    : empties the axes' signals and resets its zoom/cursor state.
 * Export   : opens ExportDialog for the axes uPlot canvas.
 */

import { useState } from "react";

import { useWaveformStore } from "../store/waveform";
import { ExportDialog } from "./ExportDialog";
import { dataExtents, valueExtents } from "./axes-config";

export interface WaveformToolbarProps {
  /** The axes whose zoom/cursor state this toolbar controls. */
  axesId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WaveformToolbar({ axesId }: WaveformToolbarProps) {
  const axesEntry = useWaveformStore((s) => s.axes.get(axesId));
  const signalCache = useWaveformStore((s) => s.signalCache);
  const setAxesZoom = useWaveformStore((s) => s.setAxesZoom);
  const setAxesYZoom = useWaveformStore((s) => s.setAxesYZoom);
  const setAxesCursor = useWaveformStore((s) => s.setAxesCursor);
  const setAxesPanMode = useWaveformStore((s) => s.setAxesPanMode);
  const clearAxes = useWaveformStore((s) => s.clearAxes);

  const [exportCanvas, setExportCanvas] = useState<HTMLCanvasElement | null>(null);

  if (!axesEntry) return null;

  const { signals, xMin, xMax, panMode } = axesEntry;

  // Derive the current visible window, falling back to data extents if not set.
  const extents = dataExtents(signals, signalCache);
  const currentMin = xMin ?? extents?.[0] ?? 0;
  const currentMax = xMax ?? extents?.[1] ?? 1;
  const mid = (currentMin + currentMax) / 2;
  const halfSpan = (currentMax - currentMin) / 2;

  // -------------------------------------------------------------------------
  // Zoom In — halve the span centred on mid
  // -------------------------------------------------------------------------
  function handleZoomIn() {
    const newMin = mid - halfSpan / 2;
    const newMax = mid + halfSpan / 2;
    setAxesZoom(axesId, newMin, newMax);
  }

  // -------------------------------------------------------------------------
  // Zoom Out — double the span (clamped to data extents)
  // -------------------------------------------------------------------------
  function handleZoomOut() {
    let newMin = mid - halfSpan * 2;
    let newMax = mid + halfSpan * 2;
    if (extents) {
      newMin = Math.max(newMin, extents[0]);
      newMax = Math.min(newMax, extents[1]);
    }
    setAxesZoom(axesId, newMin, newMax);
  }

  // -------------------------------------------------------------------------
  // Fit X — reset xMin/xMax to the union data extent
  // -------------------------------------------------------------------------
  function handleFitX() {
    if (!extents) return;
    setAxesZoom(axesId, extents[0], extents[1]);
  }

  // -------------------------------------------------------------------------
  // Fit Y — reset yMin/yMax to the value range within the current visible
  // x-window (falls back to the full x-extent if no zoom is set), leaving
  // xMin/xMax untouched.
  // -------------------------------------------------------------------------
  function handleFitY() {
    const yExt = valueExtents(signals, signalCache, currentMin, currentMax);
    if (!yExt) return;
    setAxesYZoom(axesId, yExt[0], yExt[1]);
  }

  // -------------------------------------------------------------------------
  // Pan toggle
  // -------------------------------------------------------------------------
  function handlePanToggle() {
    setAxesPanMode(axesId, !panMode);
  }

  // -------------------------------------------------------------------------
  // Cursor placement — arm a one-shot click listener on the axes container.
  // The axes container is identified by the data-axes-id attribute on the
  // <div class="axes-container"> in Axes.tsx. "A"/"B" place a vertical
  // (time) cursor from the click's X offset; "AH"/"BH" place a horizontal
  // (value) cursor from the click's Y offset (FE-165).
  // -------------------------------------------------------------------------
  function armCursorClick(cursor: "A" | "B" | "AH" | "BH") {
    const container = document.querySelector<HTMLElement>(
      `.axes-container[data-axes-id="${axesId}"]`,
    );
    if (!container) return;

    // Determine the uplot canvas inside the container.
    const canvas = container.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const isHorizontal = cursor === "AH" || cursor === "BH";

    const entry = useWaveformStore.getState().axes.get(axesId);
    const cache = useWaveformStore.getState().signalCache;

    // We need the visible range along the axis being clicked. Use store
    // values (which may be set by the setScale hook in Axes.tsx), falling
    // back to data extents.
    const xExt = dataExtents(entry?.signals ?? [], cache);
    const visXMin = entry?.xMin ?? xExt?.[0] ?? 0;
    const visXMax = entry?.xMax ?? xExt?.[1] ?? 1;
    const yExt = valueExtents(entry?.signals ?? [], cache);
    const visYMin = entry?.yMin ?? yExt?.[0] ?? 0;
    const visYMax = entry?.yMax ?? yExt?.[1] ?? 1;

    function onClick(e: MouseEvent) {
      container?.removeEventListener("click", onClick);
      if (isHorizontal) {
        const offsetY = e.clientY - (canvasRect?.top ?? 0);
        const fraction = Math.max(0, Math.min(1, offsetY / canvasRect.height));
        // Canvas Y grows downward; data value grows upward.
        const value = visYMax - fraction * (visYMax - visYMin);
        setAxesCursor(axesId, cursor, value);
      } else {
        const offsetX = e.clientX - (canvasRect?.left ?? 0);
        const fraction = Math.max(0, Math.min(1, offsetX / canvasRect.width));
        const time = visXMin + fraction * (visXMax - visXMin);
        setAxesCursor(axesId, cursor, time);
      }
    }

    container.addEventListener("click", onClick, { once: true });
  }

  // -------------------------------------------------------------------------
  // Export Figure — find the uPlot canvas for this axes and open ExportDialog.
  // -------------------------------------------------------------------------
  function handleExportFigure() {
    const container = document.querySelector<HTMLElement>(
      `.axes-container[data-axes-id="${axesId}"]`,
    );
    const canvas = container?.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) return;
    setExportCanvas(canvas);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const btnBase: React.CSSProperties = {
    background: "none",
    border: "1px solid #334155",
    borderRadius: "3px",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: "0.75rem",
    padding: "2px 6px",
    lineHeight: 1.4,
  };

  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: "#1e3a5f",
    color: "#60a5fa",
    borderColor: "#3b82f6",
  };

  return (
    <>
      <div
        className="waveform-toolbar"
        role="toolbar"
        aria-label="Waveform controls"
        style={{
          display: "flex",
          gap: "4px",
          padding: "3px 6px",
          background: "#0f172a",
          borderBottom: "1px solid #1e293b",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          style={btnBase}
          title="Zoom In"
          aria-label="Zoom In"
          onClick={handleZoomIn}
        >
          +
        </button>

        <button
          type="button"
          style={btnBase}
          title="Zoom Out"
          aria-label="Zoom Out"
          onClick={handleZoomOut}
        >
          −
        </button>

        <button
          type="button"
          style={btnBase}
          title="Fit X (zoom to fit horizontally)"
          aria-label="Fit X"
          onClick={handleFitX}
        >
          Fit X
        </button>

        <button
          type="button"
          style={btnBase}
          title="Fit Y (zoom to fit vertically)"
          aria-label="Fit Y"
          onClick={handleFitY}
        >
          Fit Y
        </button>

        <div
          style={{ width: "1px", height: "14px", background: "#334155", margin: "0 2px" }}
          aria-hidden="true"
        />

        <button
          type="button"
          style={panMode ? btnActive : btnBase}
          title="Pan mode"
          aria-label="Pan mode"
          aria-pressed={panMode ?? false}
          onClick={handlePanToggle}
        >
          Pan
        </button>

        <div
          style={{ width: "1px", height: "14px", background: "#334155", margin: "0 2px" }}
          aria-hidden="true"
        />

        <button
          type="button"
          style={axesEntry.cursorA !== undefined ? btnActive : btnBase}
          title="Place Cursor A"
          aria-label="Place Cursor A"
          onClick={() => armCursorClick("A")}
        >
          A
        </button>

        <button
          type="button"
          style={axesEntry.cursorB !== undefined ? btnActive : btnBase}
          title="Place Cursor B"
          aria-label="Place Cursor B"
          onClick={() => armCursorClick("B")}
        >
          B
        </button>

        {(axesEntry.cursorA !== undefined || axesEntry.cursorB !== undefined) && (
          <span
            style={{ marginLeft: "6px", color: "#64748b", fontSize: "0.7rem" }}
            aria-live="polite"
          >
            {axesEntry.cursorA !== undefined && `A: ${axesEntry.cursorA.toPrecision(4)}s`}
            {axesEntry.cursorA !== undefined && axesEntry.cursorB !== undefined && " · "}
            {axesEntry.cursorB !== undefined && `B: ${axesEntry.cursorB.toPrecision(4)}s`}
          </span>
        )}

        <div
          style={{ width: "1px", height: "14px", background: "#334155", margin: "0 2px" }}
          aria-hidden="true"
        />

        <button
          type="button"
          style={axesEntry.cursorAH !== undefined ? btnActive : btnBase}
          title="Place Horizontal Cursor A"
          aria-label="Place Horizontal Cursor A"
          onClick={() => armCursorClick("AH")}
        >
          A—
        </button>

        <button
          type="button"
          style={axesEntry.cursorBH !== undefined ? btnActive : btnBase}
          title="Place Horizontal Cursor B"
          aria-label="Place Horizontal Cursor B"
          onClick={() => armCursorClick("BH")}
        >
          B—
        </button>

        {(axesEntry.cursorAH !== undefined || axesEntry.cursorBH !== undefined) && (
          <span
            style={{ marginLeft: "6px", color: "#64748b", fontSize: "0.7rem" }}
            aria-live="polite"
          >
            {axesEntry.cursorAH !== undefined && `A: ${axesEntry.cursorAH.toPrecision(4)}`}
            {axesEntry.cursorAH !== undefined && axesEntry.cursorBH !== undefined && " · "}
            {axesEntry.cursorBH !== undefined && `B: ${axesEntry.cursorBH.toPrecision(4)}`}
          </span>
        )}

        <div style={{ marginLeft: "auto" }} aria-hidden="true" />

        <div
          style={{ width: "1px", height: "14px", background: "#334155", margin: "0 2px" }}
          aria-hidden="true"
        />

        <button
          type="button"
          style={btnBase}
          title="Clear Axes"
          aria-label="Clear Axes"
          onClick={() => clearAxes(axesId)}
        >
          Clear
        </button>

        <div
          style={{ width: "1px", height: "14px", background: "#334155", margin: "0 2px" }}
          aria-hidden="true"
        />

        <button
          type="button"
          style={btnBase}
          title="Export Figure"
          aria-label="Export Figure"
          onClick={handleExportFigure}
        >
          Export
        </button>
      </div>

      {exportCanvas && (
        <ExportDialog
          canvas={exportCanvas}
          defaultFilename={`axes-${axesId}`}
          onClose={() => setExportCanvas(null)}
        />
      )}
    </>
  );
}

export default WaveformToolbar;
