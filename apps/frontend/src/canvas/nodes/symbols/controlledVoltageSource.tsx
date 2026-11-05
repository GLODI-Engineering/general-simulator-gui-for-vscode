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
      <line x1={0} y1={20} x2={14} y2={20} stroke={STROKE} strokeWidth={SW} />
      <polygon points="30,4 46,20 30,36 14,20" fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <line x1={46} y1={20} x2={60} y2={20} stroke={STROKE} strokeWidth={SW} />
      {/* short bar = minus (left), long bar = plus (right) */}
      <line x1={25} y1={15} x2={25} y2={25} stroke={STROKE} strokeWidth={SW} />
      <line x1={35} y1={12} x2={35} y2={28} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw, inkHeight: 28 };
export default drawing;
