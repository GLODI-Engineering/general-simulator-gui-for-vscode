/**
 * Artwork only. What this component *is* — ports, bbox, params, what it
 * compiles to — lives in gsim-core's component library and compile registry,
 * and is not affected by anything in this file.
 *
 * Drawn from IEC 60617 / IEEE 315 convention: a dependent source is a
 * diamond, never a circle.
 *
 * Two things were wrong here, and they produced the same symptom — marks with
 * no visible attachment to the symbol.
 *
 * The diamond was centred at `cy = 40` inside a box only 60 tall, so it hung
 * out of the bottom of its own footprint and its leads left at a height no
 * port sat at. Centred at 30 it matches the box, and the engine's corrected
 * `p` (left, 30) and `n` (right, 30) land exactly on the lead ends.
 *
 * And a `currentSense` arrow was drawn from y=66 to y=80 — below the box
 * entirely, where it collided with the value label and read as a terminal
 * floating in space. It implied a wired connection this component does not
 * have: a current-controlled source names its controlling element in the
 * `control` parameter, so there is no second pair of terminals to draw.
 */
import type { ReactNode } from "react";

import type { DrawContext, SymbolDrawing } from "../symbol-drawing";
import { diamond, voltageMarks } from "./dependent-source-art";

function draw(_ctx: DrawContext): ReactNode {
  return (
    <g>
      {diamond({ cx: 40, cy: 30, width: 80 })}
      {voltageMarks(40, 30)}
    </g>
  );
}

// `inkHeight` is the diamond's own height: RY = 22 either side of cy = 30,
// so the ink runs y=8..52 and the name and value are placed clear of it.
// It used to be omitted, on the grounds that the artwork filled the box --
// true only because a sense lead was being drawn out of the bottom of the
// box. With that gone the ink is the diamond, and saying so keeps the label
// off the lower vertex.
const drawing: SymbolDrawing = { draw, valueParam: "gain", inkHeight: 44 };
export default drawing;
