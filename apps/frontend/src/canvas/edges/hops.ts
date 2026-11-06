import type { Wire } from "../../model/types";
import { type EndpointResolver, type Point, netOf, polyline } from "./junctions";

/**
 * Where a wire crosses another wire it is not connected to.
 *
 * A plain crossing already means "not connected" by the junction rules, so a
 * hop adds no information a careful reader could not deduce. The trouble is
 * that deducing it is work: on a dense sheet a crossing and a connection look
 * the same except for a dot a few pixels across, and the reader has to hunt
 * for the dot to tell which they are looking at. Drawing the crossing wire as
 * stepping *over* the other makes the two cases different in shape rather
 * than in a small detail, which is why schematics have drawn them this way by
 * hand for a century.
 *
 * Only crossings between different nets produce a hop. Two wires of one net
 * that meet are a node, and a node is a dot.
 */
export interface Hop {
  /** Crossing point, in the same coordinates as the wire's own points. */
  at: Point;
}

/** Half the width of the arc drawn at a crossing. */
export const HOP_RADIUS = 7;

interface Seg {
  axis: "h" | "v";
  at: number;
  lo: number;
  hi: number;
}

function segmentsOf(points: Point[]): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    if (a[1] === b[1] && a[0] !== b[0]) {
      segs.push({ axis: "h", at: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) });
    } else if (a[0] === b[0] && a[1] !== b[1]) {
      segs.push({ axis: "v", at: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) });
    }
  }
  return segs;
}

/**
 * Hops per wire id.
 *
 * The horizontal wire is the one that hops. Which of the two does it is
 * arbitrary as long as it is *consistent*: if the choice varied from crossing
 * to crossing, a long wire would bob over some crossings and dive under
 * others, and the sheet would read as though the hops meant something.
 *
 * A crossing is only drawn where one run genuinely passes through the other's
 * interior. A run that merely ends on another -- a tee -- is a node, and
 * belongs to the junction dots.
 */
export function computeHops(wires: Wire[], endpointsFor?: EndpointResolver): Map<string, Hop[]> {
  const nets = netOf(wires);
  const geometry = wires.map((wire, index) => ({
    id: wire.id,
    net: nets[index],
    segs: segmentsOf(polyline(wire, endpointsFor)),
  }));

  const hops = new Map<string, Hop[]>();
  for (const a of geometry) {
    if (!a) continue;
    for (const b of geometry) {
      if (!b || a.id === b.id || a.net === b.net) continue;
      for (const h of a.segs) {
        if (h.axis !== "h") continue;
        for (const v of b.segs) {
          if (v.axis !== "v") continue;
          // Strictly interior on both runs: an endpoint landing on a wire is
          // a tee, which the junction dots already describe.
          if (!(v.at > h.lo && v.at < h.hi)) continue;
          if (!(h.at > v.lo && h.at < v.hi)) continue;
          const list = hops.get(a.id) ?? [];
          if (!list.some((existing) => existing.at[0] === v.at && existing.at[1] === h.at)) {
            list.push({ at: [v.at, h.at] });
          }
          hops.set(a.id, list);
        }
      }
    }
  }
  return hops;
}
