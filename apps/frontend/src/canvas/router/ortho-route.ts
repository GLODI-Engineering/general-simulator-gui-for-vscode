/**
 * FE-98: Orthogonal auto-router with obstacle avoidance.
 *
 * It also avoids lying on top of wires that are already routed. Obstacles stop
 * a wire running *through* a component; `occupied` stops two wires being drawn
 * as one stroke. The distinction that matters is parallel-and-collinear, not
 * "wires meet":
 *
 * - a vertical segment crossing a horizontal one is an ordinary crossing and is
 *   fine; schematics are full of them, and a bare crossing already means "not
 *   connected" by the junction rules;
 * - two parallel segments sharing a line and overlapping along it is not fine,
 *   because the two wires become one stroke and no reader can separate them.
 *
 * Overlap between wires of the *same net* is left alone: that is one conductor
 * drawn as a trunk with branches, and pushing those apart would make one node
 * look like two.
 *
 * Pure, DOM-free. Ported from the reference editor `schematic_editor.html`
 * (routeOrtho / detour / routeBlocked / segCrossesBox / simplifyPts).
 *
 * Coordinates are integers on a GRID-aligned lattice. A route is an array of
 * `[x, y]` waypoints; every successive pair forms a horizontal or vertical
 * segment (strict orthogonality).
 */

import type { ObstacleBox } from "./obstacles";

export const GRID = 20;

/** An axis-aligned run already taken by another wire. */
export interface RouteSegment {
  axis: "h" | "v";
  at: number;
  lo: number;
  hi: number;
  /** Wires sharing a net may overlap freely; only cross-net overlap counts. */
  net?: string | number;
}

/** Two parallel runs count as the same line within this distance. */
const COLLINEAR_TOLERANCE = 1.5;
/** How far aside an alternative rail is tried, and how many to try. */
const LANES = 6;
/** A route that runs through a component body. Unreadable; always last. */
const PENALTY_BLOCKED = 1e6;
/** A route that leaves or meets a port along the wrong axis. */
const PENALTY_FACING = 1e3;

/** The axis-aligned runs of a polyline. Zero-length runs are dropped. */
export function pointsToSegments(pts: Point[], net?: string | number): RouteSegment[] {
  const segs: RouteSegment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    if (a[1] === b[1]) {
      segs.push({ axis: "h", at: a[1], lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]), net });
    } else if (a[0] === b[0]) {
      segs.push({ axis: "v", at: a[0], lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]), net });
    }
  }
  return segs.filter((s) => s.hi - s.lo > 0);
}

/**
 * Length this route shares, collinearly, with runs already drawn.
 *
 * Overlap with a *different* net counts in full: the two wires become one
 * stroke. Overlap within the same net counts at `sameNetWeight`, which is zero
 * by default. It is not zero in practice, because a branch that runs along
 * another branch of its own net and peels off halfway puts a junction dot in
 * the middle of a plain run, where a reader cannot tell it from a crossing.
 * The node is real, so the dot is not wrong -- it is just in a place that has
 * to be puzzled out. Giving same-net sharing a smaller, non-zero cost makes
 * branches leave from the port itself, which puts the dot where a reader
 * already expects one, without ever outweighing a genuine cross-net overlap.
 */
export function routeOverlap(
  pts: Point[],
  occupied: RouteSegment[],
  net?: string | number,
  sameNetWeight = 0,
): number {
  let total = 0;
  for (const seg of pointsToSegments(pts, net)) {
    for (const other of occupied) {
      if (seg.axis !== other.axis) continue;
      if (Math.abs(seg.at - other.at) > COLLINEAR_TOLERANCE) continue;
      const shared = Math.max(0, Math.min(seg.hi, other.hi) - Math.max(seg.lo, other.lo));
      const sameNet = net !== undefined && other.net !== undefined && other.net === net;
      total += sameNet ? shared * sameNetWeight : shared;
    }
  }
  return total;
}

export type Point = [number, number];
export type Direction = "h" | "v" | null;

/** Snap a world value to the grid. */
export function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

/**
 * Does the axis-aligned segment (x1,y1)-(x2,y2) cross `box`?
 *
 * Touching the boundary or overlapping by <= 1px counts as non-crossing, so a
 * wire may run flush along a component edge without being treated as blocked.
 */
export function segCrossesBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: ObstacleBox,
): boolean {
  const bx0 = box.x;
  const by0 = box.y;
  const bx1 = box.x + box.w;
  const by1 = box.y + box.h;
  if (x1 === x2) {
    if (x1 <= bx0 || x1 >= bx1) {
      return false;
    }
    const iy0 = Math.max(Math.min(y1, y2), by0);
    const iy1 = Math.min(Math.max(y1, y2), by1);
    return iy1 - iy0 > 1;
  }
  if (y1 <= by0 || y1 >= by1) {
    return false;
  }
  const ix0 = Math.max(Math.min(x1, x2), bx0);
  const ix1 = Math.min(Math.max(x1, x2), bx1);
  return ix1 - ix0 > 1;
}

/** Does any segment of `pts` cross any obstacle box? */
export function routeBlocked(pts: Point[], obs: ObstacleBox[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) {
      continue;
    }
    const [x1, y1] = a;
    const [x2, y2] = b;
    for (const box of obs) {
      if (segCrossesBox(x1, y1, x2, y2, box)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Force a polyline to be strictly orthogonal: any non-orthogonal pair is
 * bridged with an L-bend. Collinear vertices are then simplified away.
 */
export function ensureOrtho(pts: Point[]): Point[] {
  if (pts.length < 2) {
    return pts;
  }
  const first = pts[0];
  if (!first) {
    return pts;
  }
  const out: Point[] = [first];
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    if (!cur) {
      continue;
    }
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(cur);
      continue;
    }
    const [px, py] = prev;
    const [cx, cy] = cur;
    if (px === cx || py === cy) {
      out.push([cx, cy]);
    } else {
      out.push([px, cy]);
      out.push([cx, cy]);
    }
  }
  return simplifyPts(out);
}

/** Drop collinear interior vertices. */
export function simplifyPts(pts: Point[]): Point[] {
  if (pts.length <= 2) {
    return pts;
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first || !last) {
    return pts;
  }
  const out: Point[] = [first];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    if (!prev || !cur || !next) {
      continue;
    }
    const [x0, y0] = prev;
    const [x1, y1] = cur;
    const [x2, y2] = next;
    if (!((x0 === x1 && x1 === x2) || (y0 === y1 && y1 === y2))) {
      out.push(cur);
    }
  }
  out.push(last);
  return out;
}

/**
 * Try to detour around obstacles by inserting one offset rail.
 * Searches offsets GRID*{3,5,7} in both directions. Returns null if none clear.
 */
export function detour(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  obs: ObstacleBox[],
): Point[] | null {
  for (const off of [GRID * 3, GRID * 5, GRID * 7, -GRID * 3, -GRID * 5, -GRID * 7]) {
    const r1: Point[] = [
      [x1, y1],
      [x1, snap(y1 + off)],
      [x2, snap(y1 + off)],
      [x2, y2],
    ];
    if (!routeBlocked(r1, obs)) {
      return simplifyPts(r1);
    }
    const r2: Point[] = [
      [x1, y1],
      [snap(x1 + off), y1],
      [snap(x1 + off), y2],
      [x2, y2],
    ];
    if (!routeBlocked(r2, obs)) {
      return simplifyPts(r2);
    }
  }
  return null;
}

/**
 * Coordinate for a Z-route's middle rail: grid-aligned when that lands strictly
 * between the endpoints, otherwise the nearest interior integer. Endpoints are
 * stub tips rather than lattice points, so a snapped midpoint can coincide with
 * one of them and collapse the Z back into an L.
 */
function midRail(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi - lo < 2) {
    return snap((a + b) / 2);
  }
  const snapped = snap((a + b) / 2);
  if (snapped > lo && snapped < hi) {
    return snapped;
  }
  const rounded = Math.round((a + b) / 2);
  return rounded > lo && rounded < hi ? rounded : lo + 1;
}

/**
 * Route an orthogonal wire from (x1,y1) to (x2,y2) avoiding obstacles.
 *
 * `prevDir` biases the first segment's axis and `nextDir` the last segment's —
 * both are how a port's facing direction reaches the router, so a wire leaves
 * (and arrives at) a component perpendicular to its boundary. A single L-bend
 * can only satisfy both when they differ; when they are the same axis a
 * mid-rail Z is tried first, which is the "little detour" out of the port.
 *
 * Both are soft preferences: they only order the candidates, and obstacle
 * avoidance still wins. Falls back to a detour, then to the first candidate,
 * when every candidate is blocked.
 */
export function routeOrtho(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  prevDir: Direction,
  obs: ObstacleBox[],
  nextDir: Direction = null,
  opts: { occupied?: RouteSegment[]; net?: string | number; sameNetWeight?: number } = {},
): Point[] {
  const occupied = opts.occupied ?? [];
  const net = opts.net;
  const sameNetWeight = opts.sameNetWeight ?? 0;
  if (x1 === x2 || y1 === y2) {
    const r: Point[] = [
      [x1, y1],
      [x2, y2],
    ];
    if (!routeBlocked(r, obs)) {
      return r;
    }
    return detour(x1, y1, x2, y2, obs) ?? r;
  }

  // `hFirst` leaves horizontally and arrives vertically; `vFirst` is its mirror.
  const hFirst: Point[] = [
    [x1, y1],
    [x2, y1],
    [x2, y2],
  ];
  const vFirst: Point[] = [
    [x1, y1],
    [x1, y2],
    [x2, y2],
  ];
  const mx = midRail(x1, x2);
  const my = midRail(y1, y2);
  const zH: Point[] = [
    [x1, y1],
    [mx, y1],
    [mx, y2],
    [x2, y2],
  ];
  const zV: Point[] = [
    [x1, y1],
    [x1, my],
    [x2, my],
    [x2, y2],
  ];

  let cands: Point[][];
  if (prevDir && nextDir && prevDir === nextDir) {
    cands = prevDir === "h" ? [zH, hFirst, vFirst] : [zV, vFirst, hFirst];
  } else if (prevDir === "h") {
    cands = [hFirst, vFirst];
  } else if (prevDir === "v") {
    cands = [vFirst, hFirst];
  } else if (nextDir === "h") {
    cands = [vFirst, hFirst];
  } else if (nextDir === "v") {
    cands = [hFirst, vFirst];
  } else if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) {
    cands = [hFirst, vFirst];
  } else {
    cands = [vFirst, hFirst];
  }
  // Back-out candidates: step *away* from the target first, along the axis the
  // port faces, then cross and come back. Without these the only routes that
  // exist head straight for the target, so a port facing away from it had no
  // legal way out and the router either cut through the body behind it or gave
  // up the port's facing. Both directions along the axis are offered and the
  // scoring picks; an unblocked direct route is still found first and wins on
  // a zero score, so nothing moves unless the direct way is actually bad.
  for (let k = 1; k <= LANES; k++) {
    for (const sign of [-1, 1]) {
      if (prevDir === "h") {
        const bx = x1 + sign * k * GRID;
        cands.push([
          [x1, y1],
          [bx, y1],
          [bx, y2],
          [x2, y2],
        ]);
      } else if (prevDir === "v") {
        const by = y1 + sign * k * GRID;
        cands.push([
          [x1, y1],
          [x1, by],
          [x2, by],
          [x2, y2],
        ]);
      }
      if (nextDir === "h") {
        const bx = x2 + sign * k * GRID;
        cands.push([
          [x1, y1],
          [x1, y2],
          [bx, y2],
          [x2, y2],
        ]);
      } else if (nextDir === "v") {
        const by = y2 + sign * k * GRID;
        cands.push([
          [x1, y1],
          [x2, y1],
          [x2, by],
          [x2, y2],
        ]);
      }
    }
  }

  // With nothing occupied this reduces exactly to "first candidate that is not
  // blocked", which is what it did before: an unblocked first candidate scores
  // zero and nothing can beat it. The extra rails only come into play when the
  // obvious lane is already taken by another wire.
  if (occupied.length > 0) {
    for (let k = 1; k <= LANES; k++) {
      for (const sign of [1, -1]) {
        const ox = mx + sign * k * GRID;
        const oy = my + sign * k * GRID;
        cands.push([
          [x1, y1],
          [ox, y1],
          [ox, y2],
          [x2, y2],
        ]);
        cands.push([
          [x1, y1],
          [x1, oy],
          [x2, oy],
          [x2, y2],
        ]);
      }
    }
  }

  // The axis a polyline's first (or last) segment runs along, ignoring the
  // zero-length segments `simplifyPts` would drop.
  const endAxis = (pts: Point[], which: "first" | "last"): Direction => {
    const ordered = which === "first" ? pts : [...pts].reverse();
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i];
      const b = ordered[i + 1];
      if (!a || !b) continue;
      if (a[0] !== b[0]) return "h";
      if (a[1] !== b[1]) return "v";
    }
    return null;
  };

  let best: Point[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of cands) {
    // Three faults, ranked. Running through a component is the worst: it is
    // simply unreadable. Leaving a port along the wrong axis is next -- it is
    // the reason the back-out candidates exist, and without a cost attached
    // an ordinary turn-immediately route would always be found first and win.
    // Sharing a line with another wire is last, and costs what it shares.
    const facing =
      (prevDir && endAxis(c, "first") !== prevDir ? PENALTY_FACING : 0) +
      (nextDir && endAxis(c, "last") !== nextDir ? PENALTY_FACING : 0);
    const score =
      (routeBlocked(c, obs) ? PENALTY_BLOCKED : 0) +
      facing +
      routeOverlap(c, occupied, net, sameNetWeight);
    if (score < bestScore) {
      bestScore = score;
      best = c;
      if (score === 0) break;
    }
  }
  if (best && bestScore < PENALTY_BLOCKED) {
    return simplifyPts(best);
  }
  const fallback = best ??
    cands[0] ?? [
      [x1, y1],
      [x2, y2],
    ];
  return detour(x1, y1, x2, y2, obs) ?? simplifyPts(fallback);
}
