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
      <line x1={0} y1={30} x2={18} y2={30} stroke={STROKE} strokeWidth={SW} />
      <line x1={18} y1={14} x2={18} y2={46} stroke={STROKE} strokeWidth={SW} />
      <polyline points="18,24 30,12 30,0" fill="none" stroke={STROKE} strokeWidth={SW} />
      <polyline points="18,36 30,48 30,60" fill="none" stroke={STROKE} strokeWidth={SW} />
      {/* emitter arrow pointing in (toward base bar) */}
      <polygon points="20,38 28,42 23,47" fill={STROKE} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
