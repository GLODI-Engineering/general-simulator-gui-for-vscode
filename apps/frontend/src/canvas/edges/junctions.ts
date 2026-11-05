/**
 * Junction-dot computation.
 *
 * Pure, DOM-free. Coordinates are integer .gsim_sch vertices — no
 * floating-point keys.
 *
 * A junction dot is the only thing on a schematic that distinguishes a
 * connection from a crossing, so under-drawing them is a correctness bug, not
 * a cosmetic one: a reader cannot tell whether two conductors meeting at a
 * point are joined.
 *
 * Two situations need a dot, and the original implementation saw neither of
 * them because it counted *waypoints only*:
 *
 * 1. **Three or more vertices coincide.** Wire endpoints are vertices too —
 *    they are port lead tips — and a three-way node is usually formed by
 *    wires that *end* at the shared point rather than bending there.
 *
 * 2. **A vertex lands in the interior of another wire's segment** (a T). This
 *    is how a rail is tapped: one wire runs straight through, another bends
 *    onto it. Neither wire has three vertices anywhere, so no amount of
 *    vertex counting finds it.
 *
 * A point where exactly two wire *ends* meet is left undotted: that is a port,
 * and `Port.tsx` already draws the terminal there.
 */

import type { Wire } from "../../model/types";

export interface Junction {
  x: number;
  y: number;
}

export type Point = [number, number];

/** Resolves a wire's two endpoint vertices (its port lead tips). */
export type EndpointResolver = (wire: Wire) => [Point, Point] | null;

function polyline(wire: Wire, endpointsFor?: EndpointResolver): Point[] {
  const middle: Point[] = wire.waypoints.map(([x, y]) => [x, y]);
  const ends = endpointsFor?.(wire);
  if (!ends) {
    return middle;
  }
  return [ends[0], ...middle, ends[1]];
}

/** Is `p` strictly inside the axis-aligned segment `a`–`b` (not at either end)? */
function liesInsideSegment(p: Point, a: Point, b: Point): boolean {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  if (ax === bx) {
    if (px !== ax) return false;
    const lo = Math.min(ay, by);
    const hi = Math.max(ay, by);
    return py > lo && py < hi;
  }
  if (ay === by) {
    if (py !== ay) return false;
    const lo = Math.min(ax, bx);
    const hi = Math.max(ax, bx);
    return px > lo && px < hi;
  }
  // Diagonal segments are not schematic wires; nothing taps one.
  return false;
}

export function computeJunctions(wires: Wire[], endpointsFor?: EndpointResolver): Junction[] {
  const lines = wires.map((wire) => polyline(wire, endpointsFor));

  const counts = new Map<string, { x: number; y: number; n: number }>();
  const bump = (x: number, y: number) => {
    const key = `${x},${y}`;
    const entry = counts.get(key);
    if (entry) {
      entry.n += 1;
    } else {
      counts.set(key, { x, y, n: 1 });
    }
  };
  for (const line of lines) {
    for (const [x, y] of line) {
      bump(x, y);
    }
  }

  const found = new Map<string, Junction>();
  for (const { x, y, n } of counts.values()) {
    if (n >= 3) {
      found.set(`${x},${y}`, { x, y });
    }
  }

  // T-taps: a vertex of one wire sitting inside a segment of another.
  for (let i = 0; i < lines.length; i += 1) {
    const vertices = lines[i];
    if (!vertices) continue;
    for (const vertex of vertices) {
      const key = `${vertex[0]},${vertex[1]}`;
      if (found.has(key)) continue;
      for (let j = 0; j < lines.length; j += 1) {
        if (i === j) continue;
        const other = lines[j];
        if (!other) continue;
        let tapped = false;
        for (let k = 0; k < other.length - 1; k += 1) {
          const a = other[k];
          const b = other[k + 1];
          if (a && b && liesInsideSegment(vertex, a, b)) {
            tapped = true;
            break;
          }
        }
        if (tapped) {
          found.set(key, { x: vertex[0], y: vertex[1] });
          break;
        }
      }
    }
  }

  return [...found.values()];
}
