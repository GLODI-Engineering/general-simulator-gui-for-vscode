/**
 * Current sensor: a circle marked `A`, IEC 60617 (symbol 07-21-02).
 *
 * It was drawn as a circle containing an arrow — which is the symbol for a
 * *current source*. On a sheet carrying both, the two were impossible to
 * tell apart: the measuring instrument and the thing being measured had the
 * same glyph.
 *
 * The letter is what distinguishes a meter in IEC 60617, and the voltage
 * sensor beside it was already drawn correctly as a circle marked `V`. This
 * makes the pair consistent as well as correct.
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

function draw(ctx: DrawContext): ReactNode {
  return (
    <g>
      <line x1={0} y1={20} x2={18} y2={20} stroke={STROKE} strokeWidth={SW} />
      <circle cx={30} cy={20} r={12} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <SymbolLabel ctx={ctx} x={30} y={20} size="md" maxWidth={16}>
        A
      </SymbolLabel>
      <line x1={42} y1={20} x2={60} y2={20} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw, inkHeight: 24 };
export default drawing;
