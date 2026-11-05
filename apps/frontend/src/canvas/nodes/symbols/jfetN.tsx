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
      {/* channel */}
      <line x1={20} y1={12} x2={20} y2={48} stroke={STROKE} strokeWidth={SW} />
      <polyline points="30,0 30,12 20,12" fill="none" stroke={STROKE} strokeWidth={SW} />
      <polyline points="30,60 30,48 20,48" fill="none" stroke={STROKE} strokeWidth={SW} />
      {/* gate lead, arrow pointing into channel (N) */}
      <line x1={0} y1={30} x2={13} y2={30} stroke={STROKE} strokeWidth={SW} />
      <polygon points="20,30 12,26 12,34" fill={STROKE} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
