/**
 * Artwork only. What this component *is* — ports, bbox, params, what it
 * compiles to — lives in its `metadata.yaml` and in gsim-core's compile
 * registry, and is not affected by anything in this file.
 *
 * Drawn from IEC 60617 / IEEE 315 convention, not ported from earlier
 * artwork.
 */
import type { ReactNode } from "react";

import { type DrawContext, FILL, STROKE, SW, type SymbolDrawing } from "../symbol-drawing";

function draw(_ctx: DrawContext): ReactNode {
  return (
    <g>
      <line x1={0} y1={20} x2={14} y2={20} stroke={STROKE} strokeWidth={SW} />
      <polygon points="30,4 46,20 30,36 14,20" fill={FILL} stroke={STROKE} strokeWidth={SW} />
      <line x1={46} y1={20} x2={60} y2={20} stroke={STROKE} strokeWidth={SW} />
      {/* IEC 60617 marks a voltage source's polarity with an explicit + and
          -, not with bars of different length: inside a diamond the bars
          read as two meaningless strokes, and this symbol had to be told
          apart from the current source by elimination. */}
      <line x1={26} y1={13} x2={34} y2={13} stroke={STROKE} strokeWidth={SW} />
      <line x1={30} y1={9} x2={30} y2={17} stroke={STROKE} strokeWidth={SW} />
      <line x1={26} y1={28} x2={34} y2={28} stroke={STROKE} strokeWidth={SW} />
    </g>
  );
}

const drawing: SymbolDrawing = { draw, inkHeight: 28 };
export default drawing;
