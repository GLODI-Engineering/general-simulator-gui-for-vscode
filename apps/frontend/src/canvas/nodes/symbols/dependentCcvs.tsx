/**
 * Artwork only. What this component *is* — ports, bbox, params, what it
 * compiles to — lives in its `metadata.yaml` and in gsim-core's compile
 * registry, and is not affected by anything in this file.
 *
 * Drawn from IEC 60617 / IEEE 315 convention: a dependent source is a
 * diamond, never a circle.
 */
import type { ReactNode } from "react";

import type { DrawContext, SymbolDrawing } from "../symbol-drawing";
import { currentSense, diamond, voltageMarks } from "./dependent-source-art";

function draw(_ctx: DrawContext): ReactNode {
  return (
    <g>
      {diamond({ cx: 40, cy: 40, width: 80 })}
      {voltageMarks(40, 40)}
      {currentSense(40, 80)}
    </g>
  );
}

// No `inkHeight`: unlike a two-terminal part that draws a thin band on its
// port row, this artwork fills its box — the diamond spans most of the
// height and the sense leads run to the bottom edge. Declaring a short ink
// band centres it and puts the name and value inside the diamond.
const drawing: SymbolDrawing = { draw, valueParam: "gain" };
export default drawing;
