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
      <line x1={0} y1={20} x2={16} y2={20} stroke={STROKE} strokeWidth={SW} />
      <polygon points="16,8 16,32 36,20" fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <line x1={36} y1={8} x2={36} y2={32} stroke={STROKE} strokeWidth={SW} />
      <line x1={36} y1={20} x2={60} y2={20} stroke={STROKE} strokeWidth={SW} />
      {/* gate off the cathode side, down to bottom terminal */}
      <line x1={36} y1={28} x2={20} y2={40} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw, inkHeight: 26 };
export default drawing;
