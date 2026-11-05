import type uPlot from "uplot";

/** Bode stability margins provided by the simulator backend (BE-51). */
export interface BodeMargins {
  gainCrossoverHz: number;
  phaseCrossoverHz: number;
  bandwidth3dbHz: number;
  gainMarginDb: number;
  phaseMarginDeg: number;
}

/** A single annotation spec that the Axes component renders as a positioned overlay. */
export interface AnnotationSpec {
  /** "vline" = vertical dashed line spanning the full chart height. */
  kind: "vline" | "hline";
  /**
   * For vline: pixel x-position from the left edge of the uPlot canvas.
   * For hline: pixel y-position from the top edge of the uPlot canvas.
   */
  px: number;
  /** The scale key to use for position calculation ("x" | spine scaleKey). */
  scaleKey: string;
  /** Data-domain value that maps to the pixel position. */
  value: number;
  /** Label shown near the line. */
  label: string;
}

/** Badge spec rendered as a small tooltip-style overlay. */
export interface MarginBadgeSpec {
  gainMarginDb: number;
  phaseMarginDeg: number;
  bandwidth3dbHz: number;
  /** Pixel x (left) for badge placement — near the gain-crossover line. */
  pxLeft: number;
  /** Pixel y (top) for badge placement. */
  pxTop: number;
}

export interface BodeAnnotationResult {
  lines: AnnotationSpec[];
  badge: MarginBadgeSpec | null;
}

/**
 * Compute pixel positions for Bode annotation lines and the margin badge.
 *
 * @param margins  - Margin data from the simulator.
 * @param u        - Live uPlot instance (used to map data values → pixel coords).
 * @param magScaleKey - Scale key used by the magnitude (dB) spine, e.g. "scale-dB".
 */
export function buildBodeAnnotations(
  margins: BodeMargins,
  u: uPlot,
  magScaleKey: string,
): BodeAnnotationResult {
  const lines: AnnotationSpec[] = [];

  // Vertical dashed line at gain-crossover frequency.
  const gcPx = u.valToPos(margins.gainCrossoverHz, "x", true);
  lines.push({
    kind: "vline",
    px: gcPx,
    scaleKey: "x",
    value: margins.gainCrossoverHz,
    label: `f_gc ${_formatHz(margins.gainCrossoverHz)}`,
  });

  // Vertical dashed line at phase-crossover frequency (where phase = -180°).
  const pcPx = u.valToPos(margins.phaseCrossoverHz, "x", true);
  lines.push({
    kind: "vline",
    px: pcPx,
    scaleKey: "x",
    value: margins.phaseCrossoverHz,
    label: `f_pc ${_formatHz(margins.phaseCrossoverHz)}`,
  });

  // Horizontal dashed line at 0 dB — the gain-margin reference.
  const zeroPx = u.valToPos(0, magScaleKey, true);
  lines.push({
    kind: "hline",
    px: zeroPx,
    scaleKey: magScaleKey,
    value: 0,
    label: "0 dB",
  });

  // Badge anchored near the gain-crossover line, 8 px below the top.
  const badge: MarginBadgeSpec = {
    gainMarginDb: margins.gainMarginDb,
    phaseMarginDeg: margins.phaseMarginDeg,
    bandwidth3dbHz: margins.bandwidth3dbHz,
    pxLeft: gcPx + 6,
    pxTop: 8,
  };

  return { lines, badge };
}

function _formatHz(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toPrecision(3)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toPrecision(3)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toPrecision(3)} kHz`;
  return `${hz.toPrecision(3)} Hz`;
}
