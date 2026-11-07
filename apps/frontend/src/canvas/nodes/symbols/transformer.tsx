/**
 * Artwork only. What this component *is* — ports, bbox, params, what it
 * compiles to — lives in its `metadata.yaml` and in gsim-core's compile
 * registry, and is not affected by anything in this file.
 *
 * Drawn from IEC 60617 / IEEE 315 convention, not ported from earlier
 * artwork.
 */
import type { ReactNode } from "react";

import { type DrawContext, STROKE, SW, type SymbolDrawing } from "../symbol-drawing";

function draw(_ctx: DrawContext): ReactNode {
  return (
    <g>
      <line x1={0} y1={20} x2={16} y2={20} stroke={STROKE} strokeWidth={SW} />
      <line x1={0} y1={40} x2={16} y2={40} stroke={STROKE} strokeWidth={SW} />
      <path
        d="M 16 20 C 22 20 22 25 16 25 C 22 25 22 30 16 30 C 22 30 22 35 16 35 C 22 35 22 40 16 40"
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
      />
      <line x1={44} y1={20} x2={60} y2={20} stroke={STROKE} strokeWidth={SW} />
      <line x1={44} y1={40} x2={60} y2={40} stroke={STROKE} strokeWidth={SW} />
      <path
        d="M 44 20 C 38 20 38 25 44 25 C 38 25 38 30 44 30 C 38 30 38 35 44 35 C 38 35 38 40 44 40"
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
      />
      {/* core */}
      <line x1={28} y1={8} x2={28} y2={52} stroke={STROKE} strokeWidth={SW} />
      <line x1={32} y1={8} x2={32} y2={52} stroke={STROKE} strokeWidth={SW} />
      {/* polarity dots (top ends) */}
      <circle cx={22} cy={14} r={2} fill={STROKE} stroke={STROKE} strokeWidth={SW} />
      <circle cx={38} cy={14} r={2} fill={STROKE} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
