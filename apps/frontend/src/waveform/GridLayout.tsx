import { useRef } from "react";

import { useWaveformStore } from "../store/waveform";
import { Axes } from "./Axes";
import { MIN_TRACK_PX, normalizeSizes, resizeTracks, trackTemplate } from "./grid-sizing";

interface GridLayoutProps {
  figureId: string;
  rows: number;
  cols: number;
}

/**
 * The shortest a row may be before the figure scrolls instead of shrinking
 * it further. Leaves roughly 150 px of chart under the header, legend and
 * measurement strip.
 */
const MIN_ROW = 260;

/** Thickness of the draggable gap between tracks. */
const SPLITTER_PX = 6;

/** How far one arrow-key press moves a splitter, and how far with Shift held. */
const KEY_STEP_PX = 16;
const KEY_STEP_PX_COARSE = 64;

export function GridLayout({ figureId, rows, cols }: GridLayoutProps) {
  const axes = useWaveformStore((s) => s.axes);
  const figureEntry = useWaveformStore((s) => s.figures.get(figureId));
  const figureAxesIds = figureEntry?.axesIds ?? [];
  const createAxes = useWaveformStore((s) => s.createAxes);
  const addSignalToAxes = useWaveformStore((s) => s.addSignalToAxes);
  const setFigureTrackSizes = useWaveformStore((s) => s.setFigureTrackSizes);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const rowSizes = normalizeSizes(figureEntry?.rowSizes, rows);
  const colSizes = normalizeSizes(figureEntry?.colSizes, cols);

  /**
   * Drag the gap between two tracks to rebalance them.
   *
   * Pointer capture rather than window listeners: the drag must keep
   * following the pointer when it leaves the thin splitter, which it does
   * immediately, and capture is what guarantees the release arrives even if
   * the pointer ends up over a canvas that would otherwise swallow it.
   */
  function startResize(
    event: React.PointerEvent<HTMLDivElement>,
    axis: "rows" | "cols",
    index: number,
  ) {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    const box = gridRef.current?.getBoundingClientRect();
    if (!box) return;
    const startAt = axis === "rows" ? event.clientY : event.clientX;
    const totalPx = axis === "rows" ? box.height : box.width;
    const startSizes = axis === "rows" ? rowSizes : colSizes;

    const onMove = (move: PointerEvent) => {
      const delta = (axis === "rows" ? move.clientY : move.clientX) - startAt;
      const next = resizeTracks(
        startSizes,
        index,
        delta,
        totalPx,
        axis === "rows" ? MIN_ROW : MIN_TRACK_PX,
      );
      setFigureTrackSizes(figureId, axis === "rows" ? { rows: next } : { cols: next });
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  }

  /**
   * The same resize from the keyboard.
   *
   * A splitter carries `role="separator"`, which promises a keyboard user can
   * move it; without this it was pointer-only and the promise was false. One
   * press nudges by `KEY_STEP_PX`, Shift by `KEY_STEP_PX_COARSE`, and the
   * clamping is `resizeTracks`' own — the same function the drag uses, so the
   * two paths cannot disagree about a minimum.
   */
  function nudge(axis: "rows" | "cols", index: number, deltaPx: number) {
    const box = gridRef.current?.getBoundingClientRect();
    if (!box) return;
    const sizes = axis === "rows" ? rowSizes : colSizes;
    const next = resizeTracks(
      sizes,
      index,
      deltaPx,
      axis === "rows" ? box.height : box.width,
      axis === "rows" ? MIN_ROW : MIN_TRACK_PX,
    );
    setFigureTrackSizes(figureId, axis === "rows" ? { rows: next } : { cols: next });
  }

  function onSplitterKeyDown(
    event: React.KeyboardEvent<HTMLDivElement>,
    axis: "rows" | "cols",
    index: number,
  ) {
    const back = axis === "rows" ? "ArrowUp" : "ArrowLeft";
    const forward = axis === "rows" ? "ArrowDown" : "ArrowRight";
    if (event.key !== back && event.key !== forward) return;
    event.preventDefault();
    const step = event.shiftKey ? KEY_STEP_PX_COARSE : KEY_STEP_PX;
    nudge(axis, index, event.key === back ? -step : step);
  }

  // FE-167: only honor maximizedAxesId if that axes still exists in this
  // figure (it may have been deleted while maximized).
  const maximizedAxesId =
    figureEntry?.maximizedAxesId && axes.has(figureEntry.maximizedAxesId)
      ? figureEntry.maximizedAxesId
      : undefined;

  // FE-160: dropping a signal onto an empty grid cell creates an axes there
  // and adds the signal — the cell previously rendered "Drag a signal here"
  // with no onDrop/onDragOver wired at all, so nothing ever happened.
  function handleCellDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (e.dataTransfer.types.includes("application/x-signal")) {
      e.preventDefault();
    }
  }

  function handleCellDrop(e: React.DragEvent<HTMLDivElement>, row: number, col: number) {
    const raw = e.dataTransfer.getData("application/x-signal");
    if (!raw) return;
    e.preventDefault();
    try {
      const payload = JSON.parse(raw) as { simId?: string; signalName?: string };
      if (!payload.simId || !payload.signalName) return;
      const axesId = createAxes(figureId, row, col);
      addSignalToAxes(axesId, payload.simId, payload.signalName);
    } catch {
      // Malformed payload — no-op drop.
    }
  }

  // FE-167: a maximized axes fills the whole figure area; every other axes
  // in the figure stays mounted (display:none) rather than unmounted, so
  // its uPlot instance, zoom, and signal state survive the toggle — the
  // point of "maximize/restore" is that restoring is instant and lossless.
  if (maximizedAxesId) {
    return (
      <div
        className="figure-grid figure-grid--maximized"
        style={{ flex: 1, minHeight: 0, position: "relative" }}
      >
        {figureAxesIds.map((axesId) => (
          <div
            key={axesId}
            style={
              axesId === maximizedAxesId ? { position: "absolute", inset: 0 } : { display: "none" }
            }
          >
            <Axes axesId={axesId} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="figure-grid"
      ref={gridRef}
      style={{
        display: "grid",
        // A floor on row height, and a scrollbar rather than squashing.
        //
        // With `minmax(0, 1fr)` three axes in a short editor each got about
        // 70 px, and after the header, legend and measurement strip the
        // chart itself was a sliver — three unreadable plots instead of two
        // readable ones you scroll between. MIN_ROW is the height below
        // which a plot stops being worth drawing.
        // Splitter tracks are interleaved between the content tracks rather
        // than overlaid on a gap, so the draggable strip *is* the gap and
        // the browser does the positioning. `gap` is therefore 0 — the
        // splitter track is the spacing.
        gridTemplateRows: trackTemplate(rowSizes, MIN_ROW, SPLITTER_PX),
        gridTemplateColumns: trackTemplate(colSizes, MIN_TRACK_PX, SPLITTER_PX),
        flex: 1,
        gap: 0,
        padding: "6px",
        minHeight: 0,
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      {Array.from({ length: rows * cols }, (_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const axesId = figureAxesIds.find((id) => {
          const ax = axes.get(id);
          return ax?.row === row && ax?.col === col;
        });

        // Track n of the template is at CSS line 2n+1, because every odd
        // track is a splitter.
        const place = { gridRow: row * 2 + 1, gridColumn: col * 2 + 1 };

        return axesId ? (
          <div key={axesId} style={{ ...place, minHeight: 0, minWidth: 0 }}>
            <Axes axesId={axesId} />
          </div>
        ) : (
          <div
            key={`empty-${row}-${col}`}
            className="figure-grid__cell figure-grid__cell--empty"
            data-row={row}
            data-col={col}
            onDragOver={handleCellDragOver}
            onDrop={(e) => handleCellDrop(e, row, col)}
            style={{
              ...place,
              minHeight: "120px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
            }}
          >
            Drag a signal here
          </div>
        );
      })}

      {/* The gaps, made draggable. One per boundary; a row splitter spans
          every column and vice versa. */}
      {rowSizes.slice(0, -1).map((_, index) => (
        <div
          // A splitter *is* its index: it is the boundary between track n and track
          // n+1, holds no state of its own, and has no stabler identity to give it.
          // Keying by anything else would mean inventing an id to satisfy the rule.
          // biome-ignore lint/suspicious/noArrayIndexKey: the index is the identity
          key={`row-splitter-${index}`}
          tabIndex={0}
          onKeyDown={(event) => onSplitterKeyDown(event, "rows", index)}
          className="figure-grid__splitter figure-grid__splitter--row"
          role="separator"
          aria-orientation="horizontal"
          aria-label={`Resize row ${index + 1}`}
          style={{
            gridRow: index * 2 + 2,
            gridColumn: `1 / ${Math.max(1, cols * 2)}`,
          }}
          onPointerDown={(event) => startResize(event, "rows", index)}
        />
      ))}
      {colSizes.slice(0, -1).map((_, index) => (
        <div
          // As above: a column splitter is the boundary between column n and n+1.
          // biome-ignore lint/suspicious/noArrayIndexKey: the index is the identity
          key={`col-splitter-${index}`}
          tabIndex={0}
          onKeyDown={(event) => onSplitterKeyDown(event, "cols", index)}
          className="figure-grid__splitter figure-grid__splitter--col"
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize column ${index + 1}`}
          style={{
            gridColumn: index * 2 + 2,
            gridRow: `1 / ${Math.max(1, rows * 2)}`,
          }}
          onPointerDown={(event) => startResize(event, "cols", index)}
        />
      ))}
    </div>
  );
}

export default GridLayout;
