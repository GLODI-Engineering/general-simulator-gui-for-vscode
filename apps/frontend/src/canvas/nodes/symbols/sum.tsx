/**
 * Artwork only. What this component *is* — ports, bbox, params, what it
 * compiles to — lives in its `metadata.yaml` and in gsim-core's compile
 * registry, and is not affected by anything in this file.
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

/**
 * The sign beside each input comes from the block's own `signs` parameter —
 * `"+-"`, `"++"`, `"+--"` — not from a fixed assumption. Drawing a `+` on
 * the top lead and a `−` on the bottom regardless would contradict the data
 * whenever the block was configured any other way, which is worse than
 * drawing nothing.
 */
function signsOf(ctx: DrawContext, count: number): string[] {
  const raw = ctx.params.signs;
  const text = typeof raw === "string" ? raw : "";
  return Array.from({ length: count }, (_, i) => (text[i] === "-" ? "−" : "+"));
}

function draw(ctx: DrawContext): ReactNode {
  const marks = signsOf(ctx, 2);
  return (
    <g>
      <circle cx={20} cy={20} r={14} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <line x1={0} y1={10} x2={10} y2={10} stroke={STROKE} strokeWidth={SW} />
      <line x1={0} y1={30} x2={10} y2={30} stroke={STROKE} strokeWidth={SW} />
      <line x1={34} y1={20} x2={40} y2={20} stroke={STROKE} strokeWidth={SW} />
      {/* Sigma says "this adds"; the signs say what each input does. */}
      <SymbolLabel ctx={ctx} x={20} y={20} size="md">
        Σ
      </SymbolLabel>
      {/* Each mark sits just outside the circle, next to its own lead. */}
      <SymbolLabel ctx={ctx} x={10} y={8} size="sm">
        {marks[0] as string}
      </SymbolLabel>
      <SymbolLabel ctx={ctx} x={10} y={32} size="sm">
        {marks[1] as string}
      </SymbolLabel>
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
