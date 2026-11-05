/**
 * Resistor, IEC 60617 (symbol 04-01-01): a plain rectangle.
 *
 * This replaces a zigzag. The zigzag is **ANSI/IEEE 315** — the US
 * convention — and the file it came from said so in its own comment
 * ("Resistor (IEEE zigzag)"). IEC 60617 is the international standard,
 * adopted as EN 60617 across Europe and used as the national standard in
 * most of the world outside North America, and it draws a resistor as an
 * unfilled rectangle roughly three times as long as it is tall.
 *
 * This is not a matter of taste. A schematic is read by whoever opens it,
 * and a tool meant to be useful internationally should draw the symbol its
 * readers were taught. The zigzag would have quietly marked every sheet
 * this tool produces as American.
 *
 * The rectangle is 36x12 in a 60x40 box — the 3:1 proportion IEC 60617
 * draws it at.
 */
import type { ReactNode } from "react";

import { type DrawContext, FILL, STROKE, SW, type SymbolDrawing } from "../symbol-drawing";

function draw(_ctx: DrawContext): ReactNode {
  return (
    <g>
      <line x1={0} y1={20} x2={12} y2={20} stroke={STROKE} strokeWidth={SW} />
      <rect
        x={12}
        y={14}
        width={36}
        height={12}
        fill={FILL}
        stroke={STROKE}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <line x1={48} y1={20} x2={60} y2={20} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw, valueParam: "R", unit: "Ω", inkHeight: 12 };
export default drawing;
