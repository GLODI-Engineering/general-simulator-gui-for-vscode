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

const SUPERSCRIPT = [
  "",
  "",
  "\u00b2",
  "\u00b3",
  "\u2074",
  "\u2075",
  "\u2076",
  "\u2077",
  "\u2078",
  "\u2079",
];

/** The coefficient list, however it is spelled, highest power first. */
function coefficients(raw: unknown): number[] | null {
  if (Array.isArray(raw)) {
    const nums = raw.map(Number);
    return nums.every(Number.isFinite) ? nums : null;
  }
  if (typeof raw === "number") return [raw];
  if (typeof raw === "string") {
    const parts = raw
      .replace(/[[\]]/g, "")
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) return null;
    const nums = parts.map(Number);
    return nums.every(Number.isFinite) ? nums : null;
  }
  return null;
}

/** One term's coefficient, with the 1s that a reader supplies left out. */
function coefficientText(value: number, power: number): string {
  const magnitude = Math.abs(value);
  if (power > 0 && magnitude === 1) return "";
  return String(Number(magnitude.toPrecision(3)));
}

/**
 * A coefficient list as a polynomial in `s`.
 *
 * The list is what the netlist carries and what the engine wants, and it was
 * being printed raw: a plain integrator, `num=[1] den=[1,0]`, drew as "1"
 * over "1,0". That is not a hard thing to read so much as the wrong thing to
 * read -- "1,0" is a pair of numbers, and the block it labels is 1/s. Anyone
 * who knows what a transfer function is knows what `s` means, and nobody can
 * be expected to expand a coefficient vector in their head while looking at
 * a schematic.
 */
export function polynomial(raw: unknown, fallback: string): string {
  const coeffs = coefficients(raw);
  if (!coeffs || coeffs.length === 0) return fallback;
  const degree = coeffs.length - 1;
  let out = "";
  coeffs.forEach((value, index) => {
    if (value === 0) return;
    const power = degree - index;
    const body = `${coefficientText(value, power)}${power === 0 ? "" : "s"}${
      power > 1 ? (SUPERSCRIPT[power] ?? `^${power}`) : ""
    }`;
    if (out === "") {
      out = value < 0 ? `\u2212${body}` : body;
    } else {
      out += value < 0 ? ` \u2212 ${body}` : ` + ${body}`;
    }
  });
  // Every coefficient was zero, which is a legitimate polynomial.
  return out === "" ? "0" : out;
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
function draw(ctx: DrawContext): ReactNode {
  return (
    <g>
      {BOX}
      {LEADS_1}
      {L(15, 20, 45, 20)}
      <SymbolLabel ctx={ctx} x={30} y={13} size="sm" maxWidth={30}>
        {polynomial(ctx.params.num, "N(s)")}
      </SymbolLabel>
      <SymbolLabel ctx={ctx} x={30} y={27} size="sm" maxWidth={30}>
        {polynomial(ctx.params.den, "D(s)")}
      </SymbolLabel>
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
