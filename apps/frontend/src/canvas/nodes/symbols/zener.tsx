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
      <line x1={0} y1={20} x2={20} y2={20} stroke={STROKE} strokeWidth={SW} />
      <polygon points="20,8 20,32 40,20" fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <line x1={40} y1={20} x2={60} y2={20} stroke={STROKE} strokeWidth={SW} />
      {/* Z-shaped cathode bar */}
      <polyline points="36,32 40,32 40,8 44,8" fill="none" stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw, inkHeight: 20 };
export default drawing;
