/**
 * Artwork only. What this component *is* — ports, bbox, params, what it
 * compiles to — lives in its `metadata.yaml` and in gsim-core's compile
 * registry, and is not affected by anything in this file.
 *
 * Drawn from IEC 60617 / IEEE 315 convention, not ported from earlier
 * artwork.
 */
import type { ReactNode } from "react";

import { type DrawContext, STROKE, SW, type SymbolDrawing } from "../symbol-drawing";

function draw(_ctx: DrawContext): ReactNode {
  return (
    <g>
      <line x1={0} y1={20} x2={10} y2={20} stroke={STROKE} strokeWidth={SW} />
      <line x1={50} y1={20} x2={60} y2={20} stroke={STROKE} strokeWidth={SW} />
      <line x1={14} y1={12} x2={46} y2={12} stroke={STROKE} strokeWidth={SW} />
      <line x1={14} y1={28} x2={46} y2={28} stroke={STROKE} strokeWidth={SW} />
      {/* rounded ends */}
      <path d="M 14 12 A 4 8 0 0 0 14 28" fill="none" stroke={STROKE} strokeWidth={SW} />
      <path d="M 46 12 A 4 8 0 0 1 46 28" fill="none" stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw, inkHeight: 18 };
export default drawing;
