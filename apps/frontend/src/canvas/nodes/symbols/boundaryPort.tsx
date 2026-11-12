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

/**
 * The symbol's own box, and where its port sits in it.
 *
 * Not free parameters: they must agree with the catalogue entry, which
 * declares the bbox `[200, 40]` and the port at `offset: 20` on the left or
 * right face. The artwork's lead has to *reach* that point. It did not -- the
 * lead stopped at x=186 and sat at y=14 while the port was at (200, 20) -- so
 * every boundary port drew with a visible gap between the end of its own lead
 * and the start of the wire leaving it, plus a small vertical step. Nothing
 * was disconnected; it only looked it, which on a schematic is nearly as bad.
 *
 * The box is not ours to change. `engine-catalog.json` is generated from
 * `gsim_py.catalog()`, so the bbox and the port offset are the engine's, and a
 * CI job fails when the committed catalogue stops matching it. Growing the box
 * is a change in gsim-core first.
 */
const W = 200;
const PORT_Y = 20;

/**
 * Boundary-port marks are drawn heavier than the symbol stroke everything else
 * uses.
 *
 * The artwork was correct but too quiet to find: an `r: 6` circle or a 52x24
 * flag, at the same stroke as every component around it, inside a 200x40
 * footprint that is mostly empty lead. So the block that defines the sheet's
 * interface read as less important than the parts wired to it, and at sheet
 * zoom it was genuinely hard to pick out.
 *
 * The fix spends the two dimensions that are free. Weight is one: a heavier
 * stroke costs no space at all and is what separates the mark from its
 * neighbours at a glance. Width is the other: the lead is dead space, so the
 * flag grew into it rather than upward.
 *
 * Only the mark takes the heavier stroke. Drawing the lead at the same weight
 * made it worse, not better: most of a 200-wide box is lead, so a heavy one
 * put the bulk of the ink into the part that carries no meaning and the
 * symbol read as a thick rule with something on the end. A lead is a wire,
 * so it stays at the wire's own weight and the mark sits on it.
 *
 * Height is the one axis that could not grow. The port name sits under the
 * mark at `sm`, whose glyphs occupy roughly y=33 to y=42 once the baseline
 * offset is applied, and the box is only 40 tall. `TERM_R = 11` puts the
 * circle's outer stroke at y≈33, right against that text. Bigger than this
 * needs a taller bbox, which the engine owns.
 */
const MARK_SW = SW * 1.6;

/** Terminal circle radius, capped by the label beneath it. See `MARK_SW`. */
const TERM_R = 11;
/** Terminal centre, measured in from the face the lead does *not* leave by. */
const TERM_CX = 20;

/** Flag half-height. At `PORT_Y = 20` this is the same y=8..32 ceiling. */
const FLAG_HALF = 11;
/**
 * Flag body, widened into the dead lead so the mark grows without growing the
 * box -- but only so far. Drawn hollow at 88 wide it stopped reading as a port
 * marker and started reading as an empty banner, the largest object on a sheet
 * whose actual components it is supposed to sit beside. Solid ink at 76 is
 * louder than outline at 88 and takes less room to be so.
 */
const FLAG_BACK = 48;
const FLAG_SHOULDER = 100;
const FLAG_TIP = 124;

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
    const cx = outward ? W - TERM_CX : TERM_CX;
    const x1 = outward ? 0 : TERM_CX + TERM_R;
    const x2 = outward ? W - TERM_CX - TERM_R : W;
    return (
      <g>
        <line x1={x1} y1={PORT_Y} x2={x2} y2={PORT_Y} stroke={color} strokeWidth={SW} />
        <circle cx={cx} cy={PORT_Y} r={TERM_R} fill={FILL} stroke={color} strokeWidth={MARK_SW} />
        <SymbolLabel ctx={ctx} x={W / 2} y={38} size="sm" maxWidth={196} fill={color}>
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
  const top = PORT_Y - FLAG_HALF;
  const bottom = PORT_Y + FLAG_HALF;
  const points = `${FLAG_BACK},${top} ${FLAG_SHOULDER},${top} ${FLAG_TIP},${PORT_Y} ${FLAG_SHOULDER},${bottom} ${FLAG_BACK},${bottom}`;
  const lead = outward ? (
    <line x1={0} y1={PORT_Y} x2={FLAG_BACK} y2={PORT_Y} stroke={color} strokeWidth={SW} />
  ) : (
    <line x1={FLAG_TIP} y1={PORT_Y} x2={W} y2={PORT_Y} stroke={color} strokeWidth={SW} />
  );
  return (
    <g>
      {lead}
      {/* Solid, not hollow. The header above has always said the signal flag is
          "filled in the signal colour" and the code passed the background
          fill, so every causal port drew as an outline -- which threw away the
          oldest distinction in the notation the rest of this symbol follows:
          a causal mark is solid, an acausal terminal is open. Carrying the
          split in fill as well as in shape and colour means the one glance
          that finds the port also says which kind it is. */}
      <polygon
        points={points}
        fill={color}
        stroke={color}
        strokeWidth={MARK_SW}
        strokeLinejoin="round"
      />
      {/* The name goes under the flag, not inside it: a port id like
          `ctrl_freq` does not fit in an arrowhead, and shrinking it until it
          does produced `ctrl_f…` — the truncation hid exactly the part that
          distinguishes one control port from the next two. Under the mark it
          gets the full 196 of the box; beside the mark, in the lead, it would
          get 68 and start shrinking at about eleven characters. */}
      <SymbolLabel ctx={ctx} x={W / 2} y={38} size="sm" maxWidth={196} fill={color}>
        {portName(ctx)}
      </SymbolLabel>
    </g>
  );
}

export const inportDrawing: SymbolDrawing = { draw: (ctx) => draw(ctx, false) };
export const outportDrawing: SymbolDrawing = { draw: (ctx) => draw(ctx, true) };
