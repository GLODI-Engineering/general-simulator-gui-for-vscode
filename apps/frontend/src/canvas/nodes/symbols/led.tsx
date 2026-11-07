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
      <line x1={0} y1={20} x2={20} y2={20} stroke={STROKE} strokeWidth={SW} />
      <polygon points="20,8 20,32 40,20" fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <line x1={40} y1={8} x2={40} y2={32} stroke={STROKE} strokeWidth={SW} />
      <line x1={40} y1={20} x2={60} y2={20} stroke={STROKE} strokeWidth={SW} />
      {/* two emission arrows, 45 degrees, pointing away */}
      <line x1={42} y1={12} x2={47} y2={7} stroke={STROKE} strokeWidth={SW} />
      <polygon points="50,4 48,9 45,6" fill={STROKE} stroke={STROKE} strokeWidth={SW} />
      <line x1={49} y1={12} x2={54} y2={7} stroke={STROKE} strokeWidth={SW} />
      <polygon points="57,4 55,9 52,6" fill={STROKE} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw, inkHeight: 24 };
export default drawing;
