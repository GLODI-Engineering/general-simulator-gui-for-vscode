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
      <line x1={0} y1={20} x2={12} y2={20} stroke={STROKE} strokeWidth={SW} />
      <rect x={12} y={10} width={36} height={20} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <line x1={48} y1={20} x2={60} y2={20} stroke={STROKE} strokeWidth={SW} />
      {/* square-wave hatch */}
      <polyline
        points="16,20 16,25 22,25 22,15 28,15 28,25 34,25 34,15 40,15 40,20"
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
      />
      {/* thick end band marks polarity */}
      <rect x={43} y={10} width={5} height={20} fill={STROKE} stroke={STROKE} strokeWidth={SW} />
      <line x1={40} y1={20} x2={43} y2={20} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw, inkHeight: 22 };
export default drawing;
