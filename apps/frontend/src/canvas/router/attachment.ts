/**
 * FE-99: Wire attachment, live stretch and end-segment reroute on block move.
 *
 * Pure, DOM-free. Operates on .gsim_sch `Wire` polylines. When a block moves,
 * every wire endpoint connected to one of its ports translates by the same
 * delta; the adjacent interior vertex is rewritten so the wire stays strictly
 * orthogonal, and the end segment is re-routed via the FE-98 router when the
 * straight stretch would cross a newly-overlapping obstacle.
 *
 * This module never awaits the solver, compiler or kernel (optimistic-canvas
 * invariant); the single-transact guarantee lives in `selection/drag.ts`.
 */

import type { Wire } from "../../model/types";
import type { ObstacleBox } from "./obstacles";
import {
  type Direction,
  type Point,
  routeBlocked,
  routeOrtho,
  segCrossesBox,
  simplifyPts,
} from "./ortho-route";

export interface PortWireSnapshot {
  wireId: string;
  end: "first" | "last";
  blockId: string;
  portId: string;
  /** Endpoint position before the drag. */
  origin: Point;
  /**
   * Axis the port faces after mirror+rotation ('h' for left/right ports, 'v'
   * for top/bottom). Biases the segment touching this endpoint so the wire
   * leaves the body perpendicular to its boundary. Null when unknown.
   */
  exitDir?: Direction;
}

function clone(pts: Array<[number, number]>): Point[] {
  return pts.map((p) => [p[0], p[1]] as Point);
}

/**
 * For every wire endpoint connected to a moving block, capture enough to replay
 * the drag: the wire id, which end (first = `from`, last = `to`), the owning
 * block/port, and the endpoint's pre-drag position.
 */
export function snapshotPortWires(
  wires: Wire[],
  blockIds: Set<string>,
  exitDirFor?: (blockId: string, portId: string) => Direction,
): PortWireSnapshot[] {
  const out: PortWireSnapshot[] = [];
  for (const w of wires) {
    const pts = w.waypoints;
    if (pts.length < 2) {
      continue;
    }
    const firstPt = pts[0];
    const lastPt = pts[pts.length - 1];
    if (blockIds.has(w.from.block) && firstPt) {
      out.push({
        wireId: w.id,
        end: "first",
        blockId: w.from.block,
        portId: w.from.port,
        origin: [firstPt[0], firstPt[1]],
        exitDir: exitDirFor?.(w.from.block, w.from.port) ?? null,
      });
    }
    if (blockIds.has(w.to.block) && lastPt) {
      out.push({
        wireId: w.id,
        end: "last",
        blockId: w.to.block,
        portId: w.to.port,
        origin: [lastPt[0], lastPt[1]],
        exitDir: exitDirFor?.(w.to.block, w.to.port) ?? null,
      });
    }
  }
  return out;
}

/**
 * Recompute the geometry near a freshly-moved endpoint so the wire stays
 * orthogonal. When obstacles are supplied and the end segment would now cross
 * one, the affected sub-path is rebuilt with the FE-98 router.
 */
export function rerouteEndSegment(
  points: Point[],
  end: "first" | "last",
  obstacles: ObstacleBox[] = [],
  exitDir: Direction = null,
): Point[] {
  const pts = clone(points);
  if (pts.length < 2) {
    return pts;
  }

  if (end === "first") {
    const p0 = pts[0];
    const p1 = pts[1];
    if (!p0 || !p1) {
      return simplifyPts(pts);
    }
    const [x0, y0] = p0;
    if (pts.length === 2) {
      const [x1, y1] = p1;
      if (x0 !== x1 && y0 !== y1) {
        pts.splice(1, 0, [x0, y1]);
      }
    } else {
      const p2 = pts[2];
      if (p2) {
        const [x2, y2] = p2;
        pts[1] = p1[0] === x2 ? [x2, y0] : [x0, y2];
      }
    }
  } else {
    const n = pts.length;
    const pn = pts[n - 1];
    const pm = pts[n - 2];
    if (!pn || !pm) {
      return simplifyPts(pts);
    }
    const [xn, yn] = pn;
    if (n === 2) {
      const p0 = pts[0];
      if (p0) {
        const [x0, y0] = p0;
        if (xn !== x0 && yn !== y0) {
          pts.splice(1, 0, [xn, y0]);
        }
      }
    } else {
      const [xp, yp] = pm;
      const ref = pts[n - 3] ?? pts[0];
      if (ref) {
        const refX = ref[0];
        pts[n - 2] = xp === refX ? [xp, yn] : [xn, yp];
      }
    }
  }

  if (exitDir) {
    applyExitDir(pts, end, exitDir);
  }
  if (obstacles.length > 0) {
    rerouteIfBlocked(pts, end, obstacles, exitDir);
  }
  return simplifyPts(pts);
}

/**
 * Place the bend adjacent to the port endpoint so the segment touching the port
 * runs along `exitDir` — the wire's little detour out of the component before
 * it heads for the target.
 *
 * The orthogonalisation above leaves exactly one free vertex between the
 * endpoint `p` and its reference `r`, and both of its legal values ([r.x, p.y]
 * and [p.x, r.y]) keep the polyline orthogonal; `exitDir` picks between them.
 * A collinear p/r pair has no bend to place, and `simplifyPts` collapses the
 * choice away when it is degenerate.
 */
function applyExitDir(pts: Point[], end: "first" | "last", exitDir: "h" | "v"): void {
  const n = pts.length;
  if (n < 3) {
    return;
  }
  const p = end === "first" ? pts[0] : pts[n - 1];
  const midIdx = end === "first" ? 1 : n - 2;
  const r = end === "first" ? pts[2] : pts[n - 3];
  if (!p || !r) {
    return;
  }
  if (p[0] === r[0] || p[1] === r[1]) {
    return;
  }
  pts[midIdx] = exitDir === "h" ? [r[0], p[1]] : [p[0], r[1]];
}

function rerouteIfBlocked(
  pts: Point[],
  end: "first" | "last",
  obstacles: ObstacleBox[],
  exitDir: Direction = null,
): void {
  if (end === "first") {
    const anchorIdx = Math.min(2, pts.length - 1);
    const a = pts[0];
    const anchor = pts[anchorIdx];
    if (!a || !anchor) {
      return;
    }
    if (routeBlocked(pts.slice(0, anchorIdx + 1), obstacles)) {
      const sub = routeOrtho(a[0], a[1], anchor[0], anchor[1], exitDir, obstacles);
      pts.splice(0, anchorIdx + 1, ...sub);
    }
  } else {
    const n = pts.length;
    const anchorIdx = Math.max(0, n - 3);
    const a = pts[n - 1];
    const anchor = pts[anchorIdx];
    if (!a || !anchor) {
      return;
    }
    if (routeBlocked(pts.slice(anchorIdx), obstacles)) {
      // The port is this sub-path's *end*, so its facing goes in as `nextDir`.
      const sub = routeOrtho(anchor[0], anchor[1], a[0], a[1], null, obstacles, exitDir);
      pts.splice(anchorIdx, n - anchorIdx, ...sub);
    }
  }
}

/**
 * Translate every snapshotted endpoint by `delta` and re-orthogonalize each
 * affected wire. Far endpoints are left untouched. Returns a new wire array;
 * wires with no moving endpoint are returned unchanged.
 */
export function stretchAttachedWires(
  wires: Wire[],
  snapshot: PortWireSnapshot[],
  delta: Point,
  obstacles: ObstacleBox[] = [],
): Wire[] {
  const [dx, dy] = delta;
  return wires.map((w) => {
    const ends = snapshot.filter((s) => s.wireId === w.id);
    if (ends.length === 0) {
      return w;
    }
    let pts = clone(w.waypoints);
    for (const s of ends) {
      if (s.end === "first") {
        const p = pts[0];
        if (p) {
          pts[0] = [p[0] + dx, p[1] + dy];
        }
      } else {
        const i = pts.length - 1;
        const p = pts[i];
        if (p) {
          pts[i] = [p[0] + dx, p[1] + dy];
        }
      }
    }
    for (const s of ends) {
      pts = rerouteEndSegment(pts, s.end, obstacles, s.exitDir ?? null);
    }
    return { ...w, waypoints: pts };
  });
}

/** True when any segment of `pts` crosses any obstacle box. */
export function endSegmentBlocked(pts: Point[], obstacles: ObstacleBox[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) {
      continue;
    }
    for (const box of obstacles) {
      if (segCrossesBox(a[0], a[1], b[0], b[1], box)) {
        return true;
      }
    }
  }
  return false;
}
