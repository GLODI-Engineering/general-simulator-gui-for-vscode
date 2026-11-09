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

/** An instance parameter as display text, for a drawing that shows a value. */
function param(ctx: DrawContext, key: string, fallback: string): string {
  const raw = ctx.params[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  return String(raw);
}
const L = (x1: number, y1: number, x2: number, y2: number) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={STROKE} strokeWidth={SW} />
);

function draw(ctx: DrawContext): ReactNode {
  return (
    <g>
      {L(0, 20, 6, 20)}
      {L(54, 20, 60, 20)}
      <rect x={6} y={6} width={48} height={28} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <SymbolLabel ctx={ctx} x={30} y={20} size="lg" maxWidth={42}>
        {param(ctx, "name", "f(x)")}
      </SymbolLabel>
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
