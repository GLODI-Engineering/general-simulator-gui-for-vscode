import type { PortKind } from "../../model/types";
import { WIRE_STROKE } from "../edges/WireEdge";
import { STUB_LEN } from "./port-hit-test";

// Lead length comes from port-hit-test.ts, which also decides where the wire
// attaches to the lead. Two constants would silently drift apart and leave
// every wire short of (or past) the lead it is drawn to touch.
// Match WIRE_STROKE exactly, not just approximately — the stub is the visual
// continuation of the wire right up to the component boundary, and a thinner
// stub (this used to hardcode 2 against an actual WIRE_STROKE of ~3.84) reads
// as a seam where the wire suddenly changes weight right at the port.
const STUB_SW = WIRE_STROKE;
// Hit-area radius at the wire-connection tip of each stub (invisible — no filled dot is
// drawn there; the circle exists only so clicks/wire-drops near the tip land on the port).
const TERMINAL_R = 8;

function domainColor(kind: PortKind): string {
  switch (kind.domain) {
    case "signal":
    case "signal-bus":
    case "physical-signal":
      return "#111827";
    case "physical-electrical":
      return "#0a0a0a";
    case "physical-thermal":
      return "#ea580c";
    case "physical-translational":
    case "physical-rotational":
      return "#475569";
    case "function-call":
      return "#15803d";
    case "mixed":
    case "reserved.physical-fluid":
    case "reserved.physical-hydraulic":
    case "reserved.physical-magnetic":
      return "#334155";
  }
}

/**
 * Where a port's name sits relative to its terminal.
 *
 * It used to be drawn at `y = 4` — on the lead's own line — so the wire
 * leaving the port ran straight through its name. On a block with several
 * named outputs, every label had a wire through it. The name now sits clear
 * of the lead on the side the lead leaves by, which is also where a reader
 * expects it.
 */
function portLabelAnchor(side: PortSide | undefined): {
  x: number;
  y: number;
  textAnchor: "start" | "end" | "middle";
} {
  switch (side) {
    case "right":
      return { x: STUB_LEN + 4, y: -5, textAnchor: "start" };
    case "top":
      return { x: 5, y: -STUB_LEN - 5, textAnchor: "start" };
    case "bottom":
      return { x: 5, y: STUB_LEN + 12, textAnchor: "start" };
    default:
      return { x: -STUB_LEN - 4, y: -5, textAnchor: "end" };
  }
}

/** Direction vector for the stub based on which side of the component the port is on. */
function stubVector(side: PortSide): [number, number] {
  switch (side) {
    case "left":
      return [-1, 0];
    case "right":
      return [1, 0];
    case "top":
      return [0, -1];
    case "bottom":
      return [0, 1];
  }
}

export type PortSide = "left" | "right" | "top" | "bottom";

export interface PortProps {
  id: string;
  x: number;
  y: number;
  kind: PortKind;
  direction?: "in" | "out" | "inout";
  label?: string;
  /** Which face of the component block this port sits on. */
  side?: PortSide;
  /**
   * When false, the symbol's own artwork already draws the terminal stub,
   * dot and label (e.g. imported draw.io symbols) — render only an
   * invisible hit-area at the same position so wire-drawing/hit-testing
   * (which targets `[data-port-id]`, see Canvas.tsx) keeps working without
   * doubling up the visuals. Defaults to true for generated/primitive symbols.
   */
  decorate?: boolean;
}

export function Port({
  id,
  x,
  y,
  kind,
  direction = "inout",
  label,
  side,
  decorate = true,
}: PortProps) {
  const color = domainColor(kind);
  const accessibleLabel = `${label || id} port, ${kind.domain}, ${direction}`;
  const [dx, dy] = side ? stubVector(side) : [1, 0];
  const tipX = dx * STUB_LEN;
  const tipY = dy * STUB_LEN;

  return (
    <g
      data-port-id={id}
      data-port-kind={direction}
      data-port-domain={kind.domain}
      data-port-direction={direction}
      transform={`translate(${x} ${y})`}
      aria-label={accessibleLabel}
    >
      <title>{accessibleLabel}</title>
      {/* Stub line extending outward from the component boundary */}
      {decorate && (
        <line
          x1={0}
          y1={0}
          x2={tipX}
          y2={tipY}
          stroke={color}
          strokeWidth={STUB_SW}
          strokeLinecap="round"
        />
      )}
      {/* Invisible hit-area at the wire-connection tip (decorate=true) or at the port
          centre (decorate=false) — no filled dot is drawn at either position.
          fill="none" + pointerEvents="all" = invisible but clickable, so clicks on the
          SVG's own artwork (or on empty space right at the tip) land inside [data-port-id]. */}
      <circle
        cx={decorate ? tipX : 0}
        cy={decorate ? tipY : 0}
        r={TERMINAL_R}
        fill="none"
        stroke="none"
        pointerEvents="all"
      />
      {decorate && (
        <>
          {/* Small origin dot to mark the component boundary contact point */}
          <circle cx={0} cy={0} r={2} fill={color} />
          {label ? (
            <text {...portLabelAnchor(side)} fontSize={11} fill="#374151">
              {label}
            </text>
          ) : null}
        </>
      )}
    </g>
  );
}

export default Port;
