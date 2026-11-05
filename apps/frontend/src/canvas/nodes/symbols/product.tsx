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

/** An instance parameter as display text, for a drawing that shows a value. */
function param(ctx: DrawContext, key: string, fallback: string): string {
  const raw = ctx.params[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  return String(raw);
}
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
const curve = (pts: string) => (
  <polyline points={pts} fill="none" stroke={STROKE} strokeWidth={SW} strokeLinejoin="round" strokeLinecap="round" />
);

// The filled body is drawn first: it is opaque, and drawing it after the
// leads painted over the tips that touch it, so they read as detached.
function draw(ctx: DrawContext): ReactNode {
  return (
    <g>
      <circle cx={20} cy={20} r={15} fill={FILL} stroke={STROKE} strokeWidth={SW} />
      {L(0, 10, 9, 10)}
      {L(0, 30, 9, 30)}
      {L(35, 20, 40, 20)}
      {L(15, 15, 25, 25)}
      {L(25, 15, 15, 25)}
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
