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
 * A rectangle with a multiplication sign, matching the summing junction.
 *
 * Both were circles. A circle cannot hold more than two or three leads
 * without them crowding its edge, and these blocks take as many inputs as
 * the model needs, so the body is a box that grows with them.
 */
function draw(ctx: DrawContext): ReactNode {
  const { width, height } = ctx;
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
        ×
      </SymbolLabel>
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
