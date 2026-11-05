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
      <line x1={0} y1={20} x2={18} y2={20} stroke={STROKE} strokeWidth={SW} />
      <circle cx={30} cy={20} r={12} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <line x1={42} y1={20} x2={60} y2={20} stroke={STROKE} strokeWidth={SW} />
      {/* arrow through circle, in direction of positive current (left to right) */}
      <line x1={22} y1={20} x2={33} y2={20} stroke={STROKE} strokeWidth={SW} />
      <polygon points="38,20 31,16 31,24" fill={STROKE} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw, inkHeight: 26 };
export default drawing;
