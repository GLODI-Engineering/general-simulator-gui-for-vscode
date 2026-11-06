/**
 * export.ts — pure canvas-based export utilities for waveform figures and axes.
 *
 * No third-party dependencies — uses the native HTMLCanvasElement API only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Everything a plot can be exported as.
 *
 * The image formats answer "show me"; the data formats answer "let me check
 * it". See export-data.ts for why both have to be here.
 */
export type ExportFormat = "png" | "jpeg" | "svg" | "pdf" | "csv" | "gsim_sim_result";

/** True when the format carries numbers rather than pixels. */
export function isDataFormat(format: ExportFormat): boolean {
  return format === "csv" || format === "gsim_sim_result";
}

/** The file extension to save a given format under. */
export function extensionFor(format: ExportFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export interface ExportOptions {
  format: ExportFormat;
  /** Output DPI, clamped to [72, 600]. */
  dpi: number;
  /** Override canvas render width (pixels). Defaults to canvas.width. */
  width?: number;
  /** Override canvas render height (pixels). Defaults to canvas.height. */
  height?: number;
  /** Background fill.  Only "white" and "transparent" are supported.
   *  JPEG always uses white regardless of this setting. */
  background?: "transparent" | "white";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp DPI to the supported [72, 600] range. */
export function clampDpi(dpi: number): number {
  return Math.max(72, Math.min(600, Math.round(dpi)));
}

/** Decode a data URL's base64 payload to raw bytes, returning its MIME type too. */
function dataUrlToBytes(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header?.match(/:(.*?);/);
  const mime = mimeMatch?.[1] ?? "application/octet-stream";
  const binary = atob(base64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { mime, bytes };
}

/**
 * Convert a data-URL string to a Blob.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const { mime, bytes } = dataUrlToBytes(dataUrl);
  return new Blob([bytes as BlobPart], { type: mime });
}

// ---------------------------------------------------------------------------
// Minimal PDF writer — no third-party dependency. Embeds a single JPEG
// image (DCTDecode, natively supported by the PDF image-XObject model) on
// one page sized to the export's DPI/pixel dimensions.
// ---------------------------------------------------------------------------

function _concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Build the raw bytes of a minimal single-page PDF embedding `jpegBytes`
 * scaled to fill the page. Returns bytes (not a Blob) — exported (despite
 * the leading underscore, kept for call-site consistency within this file)
 * so tests can inspect the byte output directly: jsdom's Blob polyfill
 * lacks arrayBuffer()/text(), so round-tripping through exportAxes()'s
 * returned Blob isn't testable here.
 */
export function _buildMinimalPdf(
  jpegBytes: Uint8Array,
  widthPx: number,
  heightPx: number,
  dpi: number,
): Uint8Array {
  const enc = new TextEncoder();
  // PDF page units are points (1/72 inch); convert from pixels at the export DPI.
  const widthPts = (widthPx / dpi) * 72;
  const heightPts = (heightPx / dpi) * 72;

  const parts: Uint8Array[] = [];
  const offsets: number[] = new Array(6).fill(0);
  let pos = 0;

  function push(bytes: Uint8Array) {
    parts.push(bytes);
    pos += bytes.length;
  }

  function pushObj(num: number, body: Uint8Array) {
    offsets[num] = pos;
    push(_concatBytes(enc.encode(`${num} 0 obj\n`), body, enc.encode("\nendobj\n")));
  }

  push(enc.encode("%PDF-1.4\n"));

  pushObj(1, enc.encode("<< /Type /Catalog /Pages 2 0 R >>"));
  pushObj(2, enc.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  pushObj(
    3,
    enc.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPts} ${heightPts}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    ),
  );
  pushObj(
    4,
    _concatBytes(
      enc.encode(
        `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
      ),
      jpegBytes,
      enc.encode("\nendstream"),
    ),
  );
  const content = enc.encode(`q ${widthPts} 0 0 ${heightPts} 0 0 cm /Im0 Do Q`);
  pushObj(
    5,
    _concatBytes(
      enc.encode(`<< /Length ${content.length} >>\nstream\n`),
      content,
      enc.encode("\nendstream"),
    ),
  );

  const xrefOffset = pos;
  const xrefLines = ["0000000000 65535 f \n"];
  for (let i = 1; i <= 5; i++) {
    xrefLines.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  push(enc.encode(`xref\n0 6\n${xrefLines.join("")}`));
  push(enc.encode(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));

  return _concatBytes(...parts);
}

/**
 * Draw a source canvas onto a temp canvas optionally filling with white
 * background, then return the resulting data URL.
 *
 * @param source   The canvas to read from.
 * @param mime     MIME type for toDataURL, e.g. "image/png".
 * @param quality  Quality for JPEG (0–1).
 * @param white    Whether to fill the background with white before drawing.
 * @param w        Target width (defaults to source.width).
 * @param h        Target height (defaults to source.height).
 */
function renderToDataUrl(
  source: HTMLCanvasElement,
  mime: string,
  quality: number,
  white: boolean,
  w: number,
  h: number,
): string {
  const temp = document.createElement("canvas");
  temp.width = w;
  temp.height = h;
  const ctx = temp.getContext("2d");
  if (!ctx) throw new Error("Could not obtain 2D context from temp canvas");

  if (white) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }

  ctx.drawImage(source, 0, 0, w, h);
  return temp.toDataURL(mime, quality);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export a canvas element as PNG, JPEG, or SVG.
 *
 * @param canvas  The HTMLCanvasElement to export (typically the uPlot canvas).
 * @param opts    Export options.
 * @returns       A Promise that resolves to a Blob of the appropriate MIME type.
 */
export async function exportAxes(canvas: HTMLCanvasElement, opts: ExportOptions): Promise<Blob> {
  const dpi = clampDpi(opts.dpi);
  const w = opts.width ?? canvas.width;
  const h = opts.height ?? canvas.height;
  const background = opts.background ?? "transparent";

  // Scale factor relative to 96 dpi (CSS pixel baseline).
  const _scale = dpi / 96;
  const scaledW = Math.round(w * _scale);
  const scaledH = Math.round(h * _scale);

  if (opts.format === "png") {
    const useWhite = background === "white";
    const dataUrl = renderToDataUrl(canvas, "image/png", 1, useWhite, scaledW, scaledH);
    return dataUrlToBlob(dataUrl);
  }

  if (opts.format === "jpeg") {
    // JPEG does not support transparency — always white fill.
    const dataUrl = renderToDataUrl(canvas, "image/jpeg", 0.92, true, scaledW, scaledH);
    return dataUrlToBlob(dataUrl);
  }

  if (opts.format === "pdf") {
    // Reuses the JPEG raster (PDF's DCTDecode image filter is JPEG data
    // as-is — no re-encoding needed) — PDF pages don't support
    // transparency any more simply than JPEG does, so mirror JPEG's
    // always-white background rather than adding SMask/Group complexity.
    const dataUrl = renderToDataUrl(canvas, "image/jpeg", 0.92, true, scaledW, scaledH);
    const { bytes } = dataUrlToBytes(dataUrl);
    const pdfBytes = _buildMinimalPdf(bytes, scaledW, scaledH, dpi);
    return new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
  }

  // SVG: wrap canvas content as a <image> data URL inside an SVG document.
  const useWhite = background === "white";
  const pngDataUrl = renderToDataUrl(canvas, "image/png", 1, useWhite, scaledW, scaledH);

  const svgString = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `     xmlns:xlink="http://www.w3.org/1999/xlink"`,
    `     width="${scaledW}" height="${scaledH}"`,
    `     viewBox="0 0 ${scaledW} ${scaledH}">`,
    `  <image x="0" y="0" width="${scaledW}" height="${scaledH}"`,
    `         xlink:href="${pngDataUrl}" />`,
    "</svg>",
  ].join("\n");

  return new Blob([svgString], { type: "image/svg+xml" });
}

/**
 * Stack several axes canvases into one image, in the order given.
 *
 * Exporting a whole figure as one picture is the common case — a figure is
 * a page of a report — and a zip of separate PNGs is not that. Each canvas
 * keeps its own width; the result is as wide as the widest, so a narrower
 * axes is left-aligned rather than stretched.
 */
export function stackCanvases(canvases: HTMLCanvasElement[], gap = 0): HTMLCanvasElement {
  if (canvases.length === 0) throw new Error("Nothing to export: this figure has no plots.");
  const width = Math.max(...canvases.map((c) => c.width));
  const height =
    canvases.reduce((sum, c) => sum + c.height, 0) + gap * Math.max(0, canvases.length - 1);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Could not obtain 2D context for the stacked export canvas");

  let y = 0;
  for (const canvas of canvases) {
    ctx.drawImage(canvas, 0, y);
    y += canvas.height + gap;
  }
  return out;
}

/** Wrap already-serialized text as a downloadable Blob. */
export function dataBlob(text: string, format: ExportFormat): Blob {
  const mime = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
  return new Blob([text], { type: mime });
}

/**
 * Trigger a browser file download for a Blob with the given filename.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a short delay to allow the download to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
