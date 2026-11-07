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
  type SymbolDrawing,
  SymbolLabel,
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
  // Two spellings, because the catalogue and the compiler disagree about
  // which one this parameter is. `metadata.yaml` declares it a string and
  // defaults it to "++"; gsim-core's `Arity::ParamLen` reads it with
  // `as_array`, so a document that compiles carries `[1, -1]`. Reading only
  // the string form meant every sum on a compilable sheet fell back to the
  // "+-" default: a three-input summing junction drew two inputs, one of
  // them negated, and nothing in the picture was true.
  if (Array.isArray(raw)) {
    return raw.map((value) => (Number(value) < 0 ? "−" : "+"));
  }
  if (typeof raw === "string" && raw.length > 0) {
    // A comma-separated numeric string is the same list spelled the other
    // way, and reading it as individual characters would give one port per
    // digit and comma.
    if (raw.includes(",")) {
      return raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => (Number(part) < 0 ? "−" : "+"));
    }
    return [...raw].map((c) => (c === "-" ? "−" : "+"));
  }
  return ["+", "−"];
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
