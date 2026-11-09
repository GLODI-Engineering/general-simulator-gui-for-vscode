/**
 * Artwork only. What this component *is* — ports, bbox, params, what it
 * compiles to — lives in its `metadata.yaml` and in gsim-core's compile
 * registry, and is not affected by anything in this file.
 *
 * Drawn from IEC 60617 / IEEE 315 convention, not ported from earlier
 * artwork.
 */
import type { ReactNode } from "react";

import { FILL, STROKE, SW, type SymbolDrawing } from "../symbol-drawing";

const L = (x1: number, y1: number, x2: number, y2: number) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={STROKE} strokeWidth={SW} />
);

function draw(): ReactNode {
  return (
    <g>
      {L(0, 10, 14, 10)}
      {L(0, 30, 14, 30)}
      {L(52, 20, 60, 20)}
      <polygon
        points="14,2 14,38 52,20"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      {L(16, 10, 20, 10)}
      {L(18, 8, 18, 12)}
      {L(16, 30, 20, 30)}
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
