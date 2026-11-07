/**
 * Artwork only. What this component *is* — ports, bbox, params, what it
 * compiles to — lives in its `metadata.yaml` and in gsim-core's compile
 * registry, and is not affected by anything in this file.
 *
 * Drawn from IEC 60617 / IEEE 315 convention, not ported from earlier
 * artwork.
 */
import type { ReactNode } from "react";

import { type DrawContext, FILL, STROKE, SW, type SymbolDrawing } from "../symbol-drawing";

function draw(_ctx: DrawContext): ReactNode {
  return (
    <g>
      <line x1={0} y1={20} x2={14} y2={20} stroke={STROKE} strokeWidth={SW} />
      <line x1={0} y1={40} x2={14} y2={40} stroke={STROKE} strokeWidth={SW} />
      <polygon points="14,10 14,50 68,30" fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <line x1={68} y1={30} x2={80} y2={30} stroke={STROKE} strokeWidth={SW} />
      {/* inverting input: minus bar */}
      <line x1={20} y1={20} x2={28} y2={20} stroke={STROKE} strokeWidth={SW} />
      {/* non-inverting input: plus from two crossed bars */}
      <line x1={20} y1={40} x2={28} y2={40} stroke={STROKE} strokeWidth={SW} />
      <line x1={24} y1={36} x2={24} y2={44} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
