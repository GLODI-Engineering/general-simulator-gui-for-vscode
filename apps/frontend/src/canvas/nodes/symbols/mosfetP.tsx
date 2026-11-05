/**
 * Artwork only. What this component *is* — ports, bbox, params, what it
 * compiles to — lives in its `metadata.yaml` and in gsim-core's compile
 * registry, and is not affected by anything in this file.
 *
 * Drawn from IEC 60617 / IEEE 315 convention, not ported from earlier
 * artwork.
 */
import type { ReactNode } from "react";

import {
  type DrawContext,
  FILL,
  STROKE,
  SW,
  SymbolLabel,
  type SymbolDrawing,
} from "../symbol-drawing";

function draw(_ctx: DrawContext): ReactNode {
  return (
    <g>
      <line x1={0} y1={30} x2={14} y2={30} stroke={STROKE} strokeWidth={SW} />
      <line x1={14} y1={14} x2={14} y2={46} stroke={STROKE} strokeWidth={SW} />
      <line x1={20} y1={14} x2={20} y2={22} stroke={STROKE} strokeWidth={SW} />
      <line x1={20} y1={26} x2={20} y2={34} stroke={STROKE} strokeWidth={SW} />
      <line x1={20} y1={38} x2={20} y2={46} stroke={STROKE} strokeWidth={SW} />
      <polyline points="30,0 30,18 20,18" fill="none" stroke={STROKE} strokeWidth={SW} />
      <polyline points="30,60 30,42 20,42" fill="none" stroke={STROKE} strokeWidth={SW} />
      {/* body line, arrow pointing away from channel */}
      <line x1={20} y1={30} x2={30} y2={30} stroke={STROKE} strokeWidth={SW} />
      <polygon points="28,30 20,26 20,34" fill={STROKE} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
