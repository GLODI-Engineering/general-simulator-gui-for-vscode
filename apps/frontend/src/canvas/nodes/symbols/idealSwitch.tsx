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
  SymbolLabel,
  type SymbolDrawing,
} from "../symbol-drawing";

function draw(_ctx: DrawContext): ReactNode {
  return (
    <g>
      {/* fixed contact (top) and pivot (bottom) */}
      <line x1={30} y1={0} x2={30} y2={12} stroke={STROKE} strokeWidth={SW} />
      <line x1={30} y1={46} x2={30} y2={60} stroke={STROKE} strokeWidth={SW} />
      {/* open blade */}
      <line x1={30} y1={46} x2={38} y2={16} stroke={STROKE} strokeWidth={SW} />
      <circle cx={30} cy={12} r={2} fill={STROKE} stroke={STROKE} strokeWidth={SW} />
      <circle cx={30} cy={46} r={2} fill={STROKE} stroke={STROKE} strokeWidth={SW} />
      {/* control lead: solid then dashed to the blade */}
      <line x1={0} y1={30} x2={12} y2={30} stroke={STROKE} strokeWidth={SW} />
      <path
        d="M 12 30 L 34 30"
        fill="none"
        stroke={STROKE}
        strokeWidth={SW}
        strokeDasharray="4 3"
      />
      {/* Terminal letters. The three leads are not interchangeable -- the
          blade carries the load between D and S while the dashed lead only
          actuates it -- and on a back-to-back pair, where one device is
          mirrored so the two sources meet, which end is which stops being
          obvious from position alone. The metadata has carried these names
          all along; they were simply never drawn. */}
      <SymbolLabel ctx={_ctx} x={40} y={9} size="sm">
        D
      </SymbolLabel>
      <SymbolLabel ctx={_ctx} x={40} y={55} size="sm">
        S
      </SymbolLabel>
      <SymbolLabel ctx={_ctx} x={6} y={24} size="sm">
        G
      </SymbolLabel>
    </g>
  );
}

const drawing: SymbolDrawing = { draw };
export default drawing;
