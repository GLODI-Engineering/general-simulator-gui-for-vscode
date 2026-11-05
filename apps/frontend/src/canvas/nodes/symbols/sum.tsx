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
 * How many inputs this instance has, from the `signs` parameter that also
 * decides their signs. A summing junction is variadic — four or five inputs
 * is ordinary — which is why the body is a rectangle and not a circle: the
 * box grows with the input count and a circle of fixed radius would have the
 * leads crowding into it.
 */
function signsOf(ctx: DrawContext): string[] {
  const raw = ctx.params.signs;
  const text = typeof raw === "string" && raw.length > 0 ? raw : "+-";
  return [...text].map((c) => (c === "-" ? "−" : "+"));
}

/**
 * Where the i-th of n inputs sits down the left edge.
 *
 * Mirrors the even spread `resolveBlockPorts` computes for a variadic group,
 * so each sign lands beside its own lead however many there are.
 */
function inputRow(index: number, count: number, height: number): number {
  return Math.round((height * (index + 1)) / (count + 1));
}

function draw(ctx: DrawContext): ReactNode {
  const { width, height } = ctx;
  const signs = signsOf(ctx);
  return (
    <g>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={FILL}
        stroke={STROKE}
        strokeWidth={SW}
      />
      <SymbolLabel ctx={ctx} x={width / 2} y={height / 2} size="lg">
        Σ
      </SymbolLabel>
      {/* Each sign sits at the edge its lead enters by, not against the body
          text — that is where the eye goes to read what an input does. */}
      {signs.map((sign, index) => (
        <SymbolLabel
          key={`${sign}-${inputRow(index, signs.length, height)}`}
          ctx={ctx}
          x={7}
          y={inputRow(index, signs.length, height)}
          size="sm"
        >
          {sign}
        </SymbolLabel>
      ))}
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
