/**
 * ExportDialog — modal dialog for exporting a waveform axes canvas to
 * PNG, JPEG, SVG, or PDF with configurable DPI, size, and background.
 *
 * Usage:
 *   <ExportDialog canvas={canvasEl} defaultFilename="axes" onClose={() => {}} />
 */

import { useRef, useState } from "react";

import { type ExportOptions, clampDpi, exportAxes, triggerDownload } from "./export";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportDialogProps {
  /** The canvas element to export. */
  canvas: HTMLCanvasElement;
  /** Suggested base filename (without extension). */
  defaultFilename?: string;
  /** Called when the dialog is dismissed (Cancel or after Export). */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExportDialog({ canvas, defaultFilename = "waveform", onClose }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportOptions["format"]>("png");
  const [dpi, setDpi] = useState(150);
  const [dpiRaw, setDpiRaw] = useState("150");
  const [width, setWidth] = useState(canvas.width);
  const [widthRaw, setWidthRaw] = useState(String(canvas.width));
  const [height, setHeight] = useState(canvas.height);
  const [heightRaw, setHeightRaw] = useState(String(canvas.height));
  const [background, setBackground] = useState<ExportOptions["background"]>("transparent");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);

  // JPEG and PDF (which reuses the JPEG raster) always use white; hide the
  // background selector for both.
  const showBackground = format !== "jpeg" && format !== "pdf";

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleFormatChange(f: ExportOptions["format"]) {
    setFormat(f);
    if (f === "jpeg" || f === "pdf") {
      setBackground("white");
    }
  }

  function handleDpiBlur() {
    const parsed = Number.parseInt(dpiRaw, 10);
    const clamped = clampDpi(Number.isNaN(parsed) ? 150 : parsed);
    setDpi(clamped);
    setDpiRaw(String(clamped));
  }

  function handleWidthBlur() {
    const parsed = Number.parseInt(widthRaw, 10);
    const v = Number.isNaN(parsed) || parsed < 1 ? canvas.width : parsed;
    setWidth(v);
    setWidthRaw(String(v));
  }

  function handleHeightBlur() {
    const parsed = Number.parseInt(heightRaw, 10);
    const v = Number.isNaN(parsed) || parsed < 1 ? canvas.height : parsed;
    setHeight(v);
    setHeightRaw(String(v));
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const opts: ExportOptions = {
        format,
        dpi,
        width,
        height,
        background: format === "jpeg" || format === "pdf" ? "white" : background,
      };
      const blob = await exportAxes(canvas, opts);
      const ext = format === "jpeg" ? "jpg" : format;
      triggerDownload(blob, `${defaultFilename}.${ext}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  // -------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const inputStyle: React.CSSProperties = {
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "3px",
    color: "#e2e8f0",
    fontSize: "0.8rem",
    padding: "3px 6px",
    width: "80px",
  };

  const labelStyle: React.CSSProperties = {
    color: "#94a3b8",
    fontSize: "0.75rem",
    minWidth: "90px",
  };

  const rowStyle: React.CSSProperties = {
    alignItems: "center",
    display: "flex",
    gap: "8px",
    marginBottom: "10px",
  };

  const radioStyle: React.CSSProperties = {
    accentColor: "#3b82f6",
    cursor: "pointer",
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    /* Backdrop */
    <div
      role="presentation"
      style={{
        alignItems: "center",
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        position: "fixed",
        zIndex: 1100,
      }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      {/* Dialog panel */}
      <dialog
        ref={dialogRef}
        aria-label="Export figure"
        open
        style={{
          background: "#1e293b",
          border: "none",
          borderRadius: "6px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          color: "#e2e8f0",
          minWidth: "320px",
          padding: "20px 24px",
        }}
      >
        <h2
          style={{
            color: "#f1f5f9",
            fontSize: "0.95rem",
            fontWeight: 600,
            marginBottom: "16px",
            marginTop: 0,
          }}
        >
          Export Figure
        </h2>

        {/* Format */}
        <fieldset style={{ border: "none", margin: 0, padding: 0, marginBottom: "14px" }}>
          <legend
            style={{
              color: "#94a3b8",
              fontSize: "0.75rem",
              marginBottom: "6px",
              padding: 0,
            }}
          >
            Format
          </legend>
          <div style={{ display: "flex", gap: "16px" }}>
            {(["png", "jpeg", "svg", "pdf"] as const).map((f) => (
              <label
                key={f}
                style={{
                  alignItems: "center",
                  color: "#e2e8f0",
                  cursor: "pointer",
                  display: "flex",
                  fontSize: "0.8rem",
                  gap: "5px",
                }}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={f}
                  checked={format === f}
                  onChange={() => handleFormatChange(f)}
                  style={radioStyle}
                />
                {f.toUpperCase()}
              </label>
            ))}
          </div>
        </fieldset>

        {/* DPI */}
        <div style={rowStyle}>
          <span style={labelStyle}>DPI</span>
          <input
            type="number"
            aria-label="DPI"
            min={72}
            max={600}
            value={dpiRaw}
            onChange={(e) => setDpiRaw(e.target.value)}
            onBlur={handleDpiBlur}
            style={inputStyle}
          />
          <span style={{ color: "#64748b", fontSize: "0.7rem" }}>72 – 600</span>
        </div>

        {/* Width × Height */}
        <div style={rowStyle}>
          <span style={labelStyle}>Width × Height</span>
          <input
            type="number"
            aria-label="Width"
            min={1}
            value={widthRaw}
            onChange={(e) => setWidthRaw(e.target.value)}
            onBlur={handleWidthBlur}
            style={inputStyle}
          />
          <span style={{ color: "#64748b", fontSize: "0.8rem" }}>×</span>
          <input
            type="number"
            aria-label="Height"
            min={1}
            value={heightRaw}
            onChange={(e) => setHeightRaw(e.target.value)}
            onBlur={handleHeightBlur}
            style={inputStyle}
          />
        </div>

        {/* Background */}
        {showBackground && (
          <div style={rowStyle}>
            <span style={labelStyle}>Background</span>
            <select
              aria-label="Background"
              value={background}
              onChange={(e) => setBackground(e.target.value as ExportOptions["background"])}
              style={{ ...inputStyle, width: "130px" }}
            >
              <option value="transparent">Transparent</option>
              <option value="white">White</option>
            </select>
          </div>
        )}

        {/* Error */}
        {error && (
          <p
            role="alert"
            style={{
              color: "#f87171",
              fontSize: "0.75rem",
              margin: "8px 0 0",
            }}
          >
            {error}
          </p>
        )}

        {/* Buttons */}
        <div
          style={{
            display: "flex",
            gap: "8px",
            justifyContent: "flex-end",
            marginTop: "20px",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            style={{
              background: "none",
              border: "1px solid #334155",
              borderRadius: "4px",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "0.8rem",
              padding: "5px 14px",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            aria-busy={exporting}
            style={{
              background: exporting ? "#1e3a5f" : "#2563eb",
              border: "none",
              borderRadius: "4px",
              color: "#fff",
              cursor: exporting ? "not-allowed" : "pointer",
              fontSize: "0.8rem",
              padding: "5px 14px",
            }}
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </dialog>
    </div>
  );
}

export default ExportDialog;
