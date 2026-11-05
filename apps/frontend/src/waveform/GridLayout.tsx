import { useWaveformStore } from "../store/waveform";
import { Axes } from "./Axes";

interface GridLayoutProps {
  figureId: string;
  rows: number;
  cols: number;
}

export function GridLayout({ figureId, rows, cols }: GridLayoutProps) {
  const axes = useWaveformStore((s) => s.axes);
  const figureEntry = useWaveformStore((s) => s.figures.get(figureId));
  const figureAxesIds = figureEntry?.axesIds ?? [];
  const createAxes = useWaveformStore((s) => s.createAxes);
  const addSignalToAxes = useWaveformStore((s) => s.addSignalToAxes);

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
      style={{
        display: "grid",
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        flex: 1,
        gap: "4px",
        padding: "4px",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {Array.from({ length: rows * cols }, (_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const axesId = figureAxesIds.find((id) => {
          const ax = axes.get(id);
          return ax?.row === row && ax?.col === col;
        });

        return axesId ? (
          <Axes key={axesId} axesId={axesId} />
        ) : (
          <div
            key={`empty-${row}-${col}`}
            className="figure-grid__cell figure-grid__cell--empty"
            data-row={row}
            data-col={col}
            onDragOver={handleCellDragOver}
            onDrop={(e) => handleCellDrop(e, row, col)}
            style={{
              border: "1px dashed #cbd5e1",
              borderRadius: "2px",
              background: "#ffffff",
              minHeight: "120px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748b",
              fontSize: "0.75rem",
            }}
          >
            Drag a signal here
          </div>
        );
      })}
    </div>
  );
}

export default GridLayout;
