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
  type SymbolDrawing,
  SymbolLabel,
} from "../symbol-drawing";

const L = (x1: number, y1: number, x2: number, y2: number) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={STROKE} strokeWidth={SW} />
);
const BOX = (
  <rect x={10} y={6} width={40} height={28} fill={FILL} stroke={STROKE} strokeWidth={SW} />
);
const LEADS_1 = (
  <>
    {L(0, 20, 10, 20)}
    {L(50, 20, 60, 20)}
  </>
);

function draw(ctx: DrawContext): ReactNode {
  return (
    <g>
      {BOX}
      {LEADS_1}
      <SymbolLabel ctx={ctx} x={25} y={22} size="lg">
        z
      </SymbolLabel>
      <SymbolLabel ctx={ctx} x={37} y={14} size="sm">
        −1
      </SymbolLabel>
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
