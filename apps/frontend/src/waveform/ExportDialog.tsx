/**
 * ExportDialog — export one axes, or a whole figure, as an image or as data.
 *
 * ## Why it takes a subject rather than a canvas
 *
 * It used to take a single `HTMLCanvasElement`, which quietly fixed two
 * things: only one axes could ever be exported, and only pixels. Both are
 * the wrong limit. A figure is the unit people put in a report, and a plot
 * someone wants to check is a plot they want the numbers from — see
 * export-data.ts.
 *
 * So the dialog is handed a *subject* that can produce canvases and signals
 * on demand. Lazily, because the chart can be resized or zoomed between the
 * dialog opening and Export being pressed, and the export should be of what
 * is on screen when it is asked for.
 */

import { useState } from "react";

import type { GsimSimResultFigureLayout, GsimSimResultRun } from "../results/types";
import {
  type ExportFormat,
  type ExportOptions,
  clampDpi,
  dataBlob,
  exportAxes,
  extensionFor,
  isDataFormat,
  stackCanvases,
  triggerDownload,
} from "./export";
import { toCsv, toSimResult } from "./export-data";
import type { WaveformSignal } from "./types";

export interface ExportSubject {
  kind: "axes" | "figure";
  /** Suggested base filename, and what the dialog calls the thing. */
  label: string;
  /** The canvases to draw, top to bottom. Read at export time, not at open. */
  canvases: () => HTMLCanvasElement[];
  /** The signals behind them, for the data formats. */
  signals: () => WaveformSignal[];
  /** How they are laid out, carried into a `.gsim_sim_result`. */
  layout?: () => GsimSimResultFigureLayout[];
  run: () => GsimSimResultRun;
}

export interface ExportDialogProps {
  subject: ExportSubject;
  onClose: () => void;
}

const IMAGE_FORMATS: ExportFormat[] = ["png", "jpeg", "svg", "pdf"];
const DATA_FORMATS: ExportFormat[] = ["csv", "gsim_sim_result"];

const FORMAT_LABEL: Record<ExportFormat, string> = {
  png: "PNG",
  jpeg: "JPEG",
  svg: "SVG",
  pdf: "PDF",
  csv: "CSV",
  gsim_sim_result: "Result file",
};

const FORMAT_HINT: Record<ExportFormat, string> = {
  png: "Lossless raster. The usual choice for a document or an issue.",
  jpeg: "Smaller, lossy, always on white. Poor on sharp switching edges.",
  svg: "Vector wrapper around the raster, for scaling in a layout tool.",
  pdf: "One page at the chosen size, for printing or attaching.",
  csv: "One column per signal against the sweep. Opens anywhere; drops units and the last bits.",
  gsim_sim_result:
    "The whole result, exactly: units, quantities, layout, and samples that round-trip bit for bit. Reopens in this viewer.",
};

/** Natural pixel size of what would be exported right now. */
function subjectSize(subject: ExportSubject): { width: number; height: number } {
  const canvases = subject.canvases();
  if (canvases.length === 0) return { width: 0, height: 0 };
  return {
    width: Math.max(...canvases.map((c) => c.width)),
    height: canvases.reduce((sum, c) => sum + c.height, 0),
  };
}

export function ExportDialog({ subject, onClose }: ExportDialogProps) {
  const natural = useState(() => subjectSize(subject))[0];

  const [format, setFormat] = useState<ExportFormat>("png");
  const [dpi, setDpi] = useState(150);
  const [dpiRaw, setDpiRaw] = useState("150");
  const [width, setWidth] = useState(natural.width);
  const [widthRaw, setWidthRaw] = useState(String(natural.width));
  const [height, setHeight] = useState(natural.height);
  const [heightRaw, setHeightRaw] = useState(String(natural.height));
  const [background, setBackground] = useState<ExportOptions["background"]>("white");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataFormat = isDataFormat(format);
  // JPEG and PDF (which reuses the JPEG raster) are always white.
  const showBackground = format === "png" || format === "svg";

  function handleFormatChange(next: ExportFormat) {
    setFormat(next);
    setError(null);
    if (next === "jpeg" || next === "pdf") setBackground("white");
  }

  function handleDpiBlur() {
    const parsed = Number.parseInt(dpiRaw, 10);
    const clamped = clampDpi(Number.isNaN(parsed) ? 150 : parsed);
    setDpi(clamped);
    setDpiRaw(String(clamped));
  }

  function handleWidthBlur() {
    const parsed = Number.parseInt(widthRaw, 10);
    const value = Number.isNaN(parsed) || parsed < 1 ? natural.width : parsed;
    setWidth(value);
    setWidthRaw(String(value));
  }

  function handleHeightBlur() {
    const parsed = Number.parseInt(heightRaw, 10);
    const value = Number.isNaN(parsed) || parsed < 1 ? natural.height : parsed;
    setHeight(value);
    setHeightRaw(String(value));
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const filename = `${subject.label}.${extensionFor(format)}`;

      if (dataFormat) {
        const signals = subject.signals();
        const text =
          format === "csv"
            ? toCsv(signals)
            : toSimResult(signals, subject.run(), subject.layout?.());
        triggerDownload(dataBlob(text, format), filename);
        onClose();
        return;
      }

      const canvases = subject.canvases();
      const source =
        canvases.length === 1 ? (canvases[0] as HTMLCanvasElement) : stackCanvases(canvases);
      const blob = await exportAxes(source, {
        format,
        dpi,
        width,
        height,
        background: showBackground ? background : "white",
      });
      triggerDownload(blob, filename);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  const title = subject.kind === "figure" ? "Export figure" : "Export axes";

  return (
    <div
      className="export-backdrop"
      role="presentation"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <dialog className="export-dialog" aria-label={title} open>
        <h2 className="export-dialog__title">{title}</h2>
        <p className="export-dialog__subject">{subject.label}</p>

        <fieldset className="export-dialog__formats">
          <legend>Image</legend>
          <div className="export-dialog__options">
            {IMAGE_FORMATS.map((candidate) => (
              <label key={candidate} title={FORMAT_HINT[candidate]}>
                <input
                  type="radio"
                  name="export-format"
                  value={candidate}
                  checked={format === candidate}
                  onChange={() => handleFormatChange(candidate)}
                />
                {FORMAT_LABEL[candidate]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="export-dialog__formats">
          <legend>Data</legend>
          <div className="export-dialog__options">
            {DATA_FORMATS.map((candidate) => (
              <label key={candidate} title={FORMAT_HINT[candidate]}>
                <input
                  type="radio"
                  name="export-format"
                  value={candidate}
                  checked={format === candidate}
                  onChange={() => handleFormatChange(candidate)}
                />
                {FORMAT_LABEL[candidate]}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="export-dialog__hint">{FORMAT_HINT[format]}</p>

        {/* The raster controls say nothing about a CSV, so they are not
            shown for one — a disabled DPI box is still a question asked. */}
        {!dataFormat && (
          <>
            <div className="export-dialog__row">
              <span className="export-dialog__label">DPI</span>
              <input
                type="number"
                aria-label="DPI"
                min={72}
                max={600}
                value={dpiRaw}
                onChange={(e) => setDpiRaw(e.target.value)}
                onBlur={handleDpiBlur}
              />
              <span className="export-dialog__note">72 – 600</span>
            </div>

            <div className="export-dialog__row">
              <span className="export-dialog__label">Width × Height</span>
              <input
                type="number"
                aria-label="Width"
                min={1}
                value={widthRaw}
                onChange={(e) => setWidthRaw(e.target.value)}
                onBlur={handleWidthBlur}
              />
              <span className="export-dialog__note">×</span>
              <input
                type="number"
                aria-label="Height"
                min={1}
                value={heightRaw}
                onChange={(e) => setHeightRaw(e.target.value)}
                onBlur={handleHeightBlur}
              />
            </div>

            {showBackground && (
              <div className="export-dialog__row">
                <span className="export-dialog__label">Background</span>
                <select
                  aria-label="Background"
                  value={background}
                  onChange={(e) => setBackground(e.target.value as ExportOptions["background"])}
                >
                  <option value="white">White</option>
                  <option value="transparent">Transparent</option>
                </select>
              </div>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="export-dialog__error">
            {error}
          </p>
        )}

        <div className="export-dialog__actions">
          <button type="button" onClick={onClose} disabled={exporting}>
            Cancel
          </button>
          <button
            type="button"
            className="export-dialog__confirm"
            onClick={() => void handleExport()}
            disabled={exporting}
            aria-busy={exporting}
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </dialog>
    </div>
  );
}

export default ExportDialog;
