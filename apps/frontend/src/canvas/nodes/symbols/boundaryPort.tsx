/**
 * Artwork for `hierarchy.inport` / `hierarchy.outport` — the boundary ports
 * placed inside a subsystem body to declare the interface its parent-side
 * block exposes.
 *
 * Both were falling back to `shape: rect` with the text "In"/"Out": a blank
 * box, identical for every domain. That makes the one thing a boundary port
 * exists to say — *what kind of connection is this?* — the one thing the
 * symbol did not say. A body sheet whose interface is four identical boxes
 * tells a reader nothing about which are power terminals and which are
 * control signals, which is exactly the question an interface answers.
 *
 * The domain comes from the block's own `kind` parameter, and the drawing
 * follows the same causal/acausal split the whole canvas rests on — the one
 * `wire-color.ts` decides for wire arrows and `Port.tsx` for terminal
 * markers:
 *
 * - **Causal (signal)** — a flag pointing the way the value travels: an
 *   inport points into the sheet, an outport out of it. Filled in the signal
 *   colour. A reader can see the direction of the interface without reading
 *   a word.
 * - **Acausal (physical-electrical, thermal, rotational, translational)** —
 *   an open circle on a short lead: the IEC 60617 terminal. No direction,
 *   because a physical connection has none; power crosses the boundary in
 *   whichever direction the circuit decides, and an arrow would assert a
 *   causality the equations do not have.
 *
 * Shape and colour both carry it, so the distinction survives a greyscale
 * print and a colour-blind reader.
 */
import type { ReactNode } from "react";

import type { PortKindDomain } from "../../../model/types";
import { isCausalDomain, wireColorForDomain } from "../../edges/wire-color";
import { type DrawContext, FILL, SW, type SymbolDrawing, SymbolLabel } from "../symbol-drawing";

/** The domain this boundary port exposes, from its own `kind` parameter. */
function domainOf(ctx: DrawContext): PortKindDomain {
  const raw = ctx.params.kind;
  return (typeof raw === "string" && raw.length > 0 ? raw : "signal") as PortKindDomain;
}

/** The port id the parent-side block will carry, e.g. `d`, `ctrl_freq`. */
function portName(ctx: DrawContext): string {
  const raw = ctx.params.id;
  const text = typeof raw === "string" ? raw.trim() : "";
  return text.length > 0 ? text : "?";
}

function draw(ctx: DrawContext, outward: boolean): ReactNode {
  const domain = domainOf(ctx);
  const color = wireColorForDomain(domain);

  if (!isCausalDomain(domain)) {
    // Terminal: a lead from the body edge ending in an open circle. Open, not
    // filled — a filled dot is the junction mark, and a terminal is not a
    // junction.
    const cx = outward ? 94 : 16;
    const x1 = outward ? 40 : 22;
    const x2 = outward ? 88 : 70;
    return (
      <g>
        <line x1={x1} y1={14} x2={x2} y2={14} stroke={color} strokeWidth={SW} />
        <circle cx={cx} cy={14} r={6} fill={FILL} stroke={color} strokeWidth={SW} />
        <SymbolLabel ctx={ctx} x={55} y={36} size="sm" maxWidth={104} fill={color}>
          {portName(ctx)}
        </SymbolLabel>
      </g>
    );
  }

  // Signal: a flag whose point gives the direction the value crosses the
  // boundary. An inport feeds the sheet, an outport leaves it; both point the
  // same way the value moves, so a row of them reads as a flow.
  // One shape for both: the flag always points the way the value travels, so a
  // row of inports on the left and outports on the right reads as a flow
  // across the sheet. What distinguishes them is which side the lead leaves
  // by — into the sheet for an inport, out of it for an outport — and where
  // they sit, which is the same cue a reader already uses.
  const points = "26,2 62,2 78,14 62,26 26,26";
  const lead = outward ? (
    <line x1={14} y1={14} x2={26} y2={14} stroke={color} strokeWidth={SW} />
  ) : (
    <line x1={78} y1={14} x2={96} y2={14} stroke={color} strokeWidth={SW} />
  );
  return (
    <g>
      {lead}
      <polygon points={points} fill={FILL} stroke={color} strokeWidth={SW} strokeLinejoin="round" />
      {/* The name goes under the flag, not inside it: a port id like
          `ctrl_freq` does not fit in an arrowhead, and shrinking it until it
          does produced `ctrl_f…` — the truncation hid exactly the part that
          distinguishes one control port from the next two. */}
      <SymbolLabel ctx={ctx} x={55} y={36} size="sm" maxWidth={104} fill={color}>
        {portName(ctx)}
      </SymbolLabel>
    </g>
  );
}

export const inportDrawing: SymbolDrawing = { draw: (ctx) => draw(ctx, false) };
export const outportDrawing: SymbolDrawing = { draw: (ctx) => draw(ctx, true) };
