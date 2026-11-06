import type { PortKind } from "../../model/types";
import { WIRE_STROKE } from "../edges/WireEdge";
import { isCausalDomain, wireColorForDomain } from "../edges/wire-color";
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

/**
 * A port is drawn in the colour of the wire that attaches to it.
 *
 * This used to be its own switch, and it had the exact bug `wire-color.ts` was
 * written to fix: `signal` was `#111827` and `physical-electrical` `#0a0a0a` —
 * two blacks nobody can tell apart, on the one canvas that hosts both
 * paradigms at once. Deriving the colour from the wire table instead means a
 * port and its wire cannot drift apart, and fixing a domain's colour fixes it
 * in both places.
 */
function domainColor(kind: PortKind): string {
  return wireColorForDomain(kind.domain);
}

/** Radius of the open circle marking an acausal (physical) terminal. */
const TERMINAL_CIRCLE_R = 3.5;
/** Half-width of the arrowhead marking a causal (signal) port. */
const SIGNAL_ARROW_HALF_W = 3.5;
/** Length of that arrowhead along the lead. */
const SIGNAL_ARROW_LEN = 7;

/**
 * The terminal marker, by causality — FE-87.
 *
 * Colour alone was never enough: it fails for a colour-blind reader, it fails
 * in a printed or greyscale sheet, and it failed outright here while the two
 * domains shared a black. The *shape* carries the same information
 * independently, so the two paradigms stay distinguishable with the colour
 * thrown away entirely.
 *
 * Which shape is not arbitrary. It is the same causal/acausal split the
 * document model already rests on and that `isCausalDomain` already decides
 * for wire arrows:
 *
 * - **Causal (signal, signal-bus, function-call, physical-signal)** — a solid
 *   arrowhead, pointing the way the value travels: inward on an input, outward
 *   on an output.
 * - **Acausal (physical-electrical, thermal, rotational, …)** — an open
 *   circle, the IEC 60617 terminal. No arrow, because an electrical node has a
 *   voltage across it and a current through it solved together: there is no
 *   "from" end, and an arrow would assert a causality the equations do not
 *   have.
 *
 * The circle is deliberately *open*. A filled dot is already taken: it is the
 * junction mark on a wire, and a filled dot at a terminal would read as "these
 * nets are joined here".
 *
 * **The two markers sit at opposite ends of the lead, on purpose.** The signal
 * arrowhead is at the *block boundary*, the acausal circle at the *tip* where a
 * wire lands. Drawing the arrowhead at the tip was the first thing tried and it
 * looked wrong immediately: a signal wire already carries its own arrow near
 * its end, so every connected signal port showed two arrowheads a few pixels
 * apart. At the boundary the arrowhead reads as part of the block — this is an
 * input, that is an output — and the wire keeps the one arrow that says which
 * way the value is travelling along it. An acausal wire carries no arrow at
 * all, so its terminal has the tip to itself.
 */
function TerminalMarker({
  kind,
  direction,
  tipX,
  tipY,
  dx,
  dy,
  color,
}: {
  kind: PortKind;
  direction: "in" | "out" | "inout";
  tipX: number;
  tipY: number;
  dx: number;
  dy: number;
  color: string;
}) {
  if (!isCausalDomain(kind.domain)) {
    return (
      <circle
        data-port-marker="acausal"
        cx={tipX}
        cy={tipY}
        r={TERMINAL_CIRCLE_R}
        fill="#ffffff"
        stroke={color}
        strokeWidth={1.5}
      />
    );
  }
  // An input's value arrives travelling *towards* the block, which is the
  // opposite of the direction its own lead points away in.
  const sign = direction === "in" ? -1 : 1;
  const ax = dx * sign;
  const ay = dy * sign;
  // Perpendicular, for the two base corners.
  const px = -ay;
  const py = ax;
  // Anchored at the block boundary (the port origin), not the tip.
  const baseX = -ax * SIGNAL_ARROW_LEN * 0.5;
  const baseY = -ay * SIGNAL_ARROW_LEN * 0.5;
  const noseX = baseX + ax * SIGNAL_ARROW_LEN;
  const noseY = baseY + ay * SIGNAL_ARROW_LEN;
  const points = [
    `${noseX},${noseY}`,
    `${baseX + px * SIGNAL_ARROW_HALF_W},${baseY + py * SIGNAL_ARROW_HALF_W}`,
    `${baseX - px * SIGNAL_ARROW_HALF_W},${baseY - py * SIGNAL_ARROW_HALF_W}`,
  ].join(" ");
  return <polygon data-port-marker="causal" points={points} fill={color} />;
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
          {/* The domain marker sits at the tip, where the wire actually lands. */}
          <TerminalMarker
            kind={kind}
            direction={direction}
            tipX={tipX}
            tipY={tipY}
            dx={dx}
            dy={dy}
            color={color}
          />
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
