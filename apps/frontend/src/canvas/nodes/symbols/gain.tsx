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
  <polyline
    points={pts}
    fill="none"
    stroke={STROKE}
    strokeWidth={SW}
    strokeLinejoin="round"
    strokeLinecap="round"
  />
);

const SI: ReadonlyArray<[number, string]> = [
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
];

/**
 * A gain's value, short enough to read inside its own triangle.
 *
 * The value *is* the block's data, so it belongs in the symbol rather than
 * beside it — but a real controller gain is `0.011067758972493853`, which no
 * triangle holds. Clipping it to "0.0…" says less than nothing.
 *
 * Engineering notation is what an engineer writes anyway: that gain is
 * `11.1m`, five characters, and it fits. Three significant figures, because
 * the inspector is where full precision belongs.
 */
function compact(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n) || value.trim() === "") {
    return value;
  }
  if (n === 0) {
    return "0";
  }
  const magnitude = Math.abs(n);
  for (const [scale, prefix] of SI) {
    if (magnitude >= scale) {
      const scaled = Number((n / scale).toPrecision(3));
      return `${scaled}${prefix}`;
    }
  }
  return n.toExponential(1);
}

function draw(ctx: DrawContext): ReactNode {
  return (
    <g>
      {L(0, 20, 12, 20)}
      {L(50, 20, 60, 20)}
      <polygon
        points="12,6 12,34 50,20"
        fill={FILL}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <SymbolLabel ctx={ctx} x={24} y={20} size="md" maxWidth={24}>
        {compact(param(ctx, "k", "k"))}
      </SymbolLabel>
    </g>
  );
}

const drawing: SymbolDrawing = { draw, inkHeight: 30 };
export default drawing;
