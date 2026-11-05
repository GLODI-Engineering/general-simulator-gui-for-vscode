/**
 * Artwork for `routing.goto` and `routing.from`.
 *
 * These are the pair that lets a sheet carry a signal from one place to
 * another without drawing a wire across it. The engine treats them as pure
 * connectivity annotations — `structural`, so neither reaches the emitted
 * netlist; the compiler resolves each `routing.from` to the real driver
 * behind its matching `routing.goto`.
 *
 * Both were falling back to a blank rectangle, which defeats the point: the
 * whole value of a tag is that you can read where the signal goes, or where
 * it came from, without following a line. If the tag is not on the symbol
 * there is nothing to read.
 *
 * Drawn as a flag whose point gives the direction: a Goto points away from
 * the signal that feeds it, a From points out of the tag it names. They are
 * mirror images on purpose — at a glance the shape says which end of the
 * link you are looking at, before you have read the name.
 *
 * Signal domain only, so they take the signal colour. An acausal physical
 * net has no "from" end, so a tag carrying one would be asserting a
 * direction the equations do not have.
 */
import type { ReactNode } from "react";

import { wireColorForDomain } from "../../edges/wire-color";
import { type DrawContext, FILL, SW, type SymbolDrawing, SymbolLabel } from "../symbol-drawing";

const SIGNAL = wireColorForDomain("signal");

function tagText(ctx: DrawContext): string {
  const raw = ctx.params.tag;
  const text = typeof raw === "string" ? raw.trim() : "";
  return text.length > 0 ? text : "?";
}

/** Signal arrives from the left and is published under a name: point right. */
function drawGoto(ctx: DrawContext): ReactNode {
  return (
    <g>
      <line x1={0} y1={20} x2={8} y2={20} stroke={SIGNAL} strokeWidth={SW} />
      <polygon
        points="8,6 54,6 68,20 54,34 8,34"
        fill={FILL}
        stroke={SIGNAL}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <SymbolLabel ctx={ctx} x={33} y={20} size="sm" maxWidth={40} fill={SIGNAL}>
        {tagText(ctx)}
      </SymbolLabel>
    </g>
  );
}

/** Signal appears from a named tag and leaves to the right: point right too,
 *  but notched at the back so the two are never confused. */
function drawFrom(ctx: DrawContext): ReactNode {
  return (
    <g>
      <polygon
        points="2,6 48,6 62,20 48,34 2,34 16,20"
        fill={FILL}
        stroke={SIGNAL}
        strokeWidth={SW}
        strokeLinejoin="round"
      />
      <line x1={62} y1={20} x2={70} y2={20} stroke={SIGNAL} strokeWidth={SW} />
      <SymbolLabel ctx={ctx} x={34} y={20} size="sm" maxWidth={36} fill={SIGNAL}>
        {tagText(ctx)}
      </SymbolLabel>
    </g>
  );
}

export const gotoDrawing: SymbolDrawing = { draw: drawGoto, inkHeight: 28 };
export const fromDrawing: SymbolDrawing = { draw: drawFrom, inkHeight: 28 };
