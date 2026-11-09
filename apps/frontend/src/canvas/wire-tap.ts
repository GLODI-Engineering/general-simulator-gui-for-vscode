import type { Block, PortKindDomain, Wire } from "../model/types";

/**
 * Tapping a wire: landing a new branch on an existing conductor instead of on a port.
 *
 * Pure, and separate from `Canvas.tsx`, so the geometry can be tested without a canvas. The
 * component supplies the endpoint resolver and applies the returned mutation.
 */

/** Where a wire's endpoint sits, in model coordinates. */
export type ResolveEndpoint = (endpoint: { block: string; port: string }) => {
  x: number;
  y: number;
} | null;

/**
 * The orthogonal polyline a wire is actually drawn as.
 *
 * A wire with no waypoints whose ends differ on both axes is drawn with one implied elbow.
 * Hit-testing the straight line between the endpoints would miss the wire wherever it bends,
 * which is most of them.
 */
export function wirePolyline(wire: Wire, resolve: ResolveEndpoint): Array<[number, number]> | null {
  const from = resolve(wire.from);
  const to = resolve(wire.to);
  if (!from || !to) return null;
  const fromPt: [number, number] = [Math.round(from.x), Math.round(from.y)];
  const toPt: [number, number] = [Math.round(to.x), Math.round(to.y)];
  if (wire.waypoints.length === 0 && fromPt[0] !== toPt[0] && fromPt[1] !== toPt[1]) {
    return [fromPt, [toPt[0], fromPt[1]], toPt];
  }
  return [
    fromPt,
    ...wire.waypoints.map(([x, y]): [number, number] => [Math.round(x), Math.round(y)]),
    toPt,
  ];
}

export interface WireHit {
  wire: Wire;
  /** The point on the wire, in model coordinates. */
  at: [number, number];
  /** Distance from the queried point, for choosing between candidates. */
  distance: number;
}

/**
 * The wire nearest a point, and where on it the point lands.
 *
 * The returned point lies **on** the wire. Snapping both coordinates to the grid would move a
 * junction off the conductor it taps by up to half a grid step and leave a visible gap, so only
 * the coordinate running along the segment is snapped.
 */
export function findWireNear(
  wires: readonly Wire[],
  resolve: ResolveEndpoint,
  point: { x: number; y: number },
  radius: number,
  grid: number,
  exclude: ReadonlySet<string> = new Set(),
): WireHit | null {
  let best: WireHit | null = null;
  const snap = (value: number) => (grid > 0 ? Math.round(value / grid) * grid : value);

  for (const wire of wires) {
    if (exclude.has(wire.id)) continue;
    const points = wirePolyline(wire, resolve);
    if (!points) continue;
    for (let i = 0; i < points.length - 1; i += 1) {
      // Indexed access is `T | undefined` under noUncheckedIndexedAccess; the loop bound makes
      // both reads present, and the guard states it rather than asserting it.
      const a = points[i];
      const b = points[i + 1];
      if (!a || !b) continue;
      const [ax, ay] = a;
      const [bx, by] = b;
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared === 0) continue;
      // Clamped projection, so releasing beyond a wire's end does not snap to the infinite
      // line it lies on.
      const u = Math.max(
        0,
        Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / lengthSquared),
      );
      const px = ax + u * dx;
      const py = ay + u * dy;
      const distance = Math.hypot(point.x - px, point.y - py);
      if (distance > radius || (best && distance >= best.distance)) continue;
      const at: [number, number] =
        Math.abs(dx) >= Math.abs(dy) ? [snap(px), Math.round(py)] : [Math.round(px), snap(py)];
      best = { wire, at, distance };
    }
  }
  return best;
}

/** The branch being drawn, as the canvas tracks it. */
export interface WireDraw {
  from: { blockId: string; portId: string; domain: PortKindDomain };
  waypoints: Array<{ x: number; y: number }>;
}

export interface JunctionSplice {
  junction: Block;
  /** The wire to remove: the one being tapped. */
  removeWireId: string;
  /** Its two halves, plus the new branch. */
  wires: Wire[];
}

/**
 * Split a wire at a point and meet it there with the branch being drawn.
 *
 * Three wires replace one, joined at a `routing.junction` block — how the model represents a
 * node with more than two conductors. `newId` is injected so a test can assert the result
 * rather than match random identifiers.
 */
export function junctionSplice(
  existing: Wire,
  at: [number, number],
  draw: WireDraw,
  newId: (kind: "junction" | "wire") => string,
): JunctionSplice {
  const [x, y] = at;
  const junctionId = newId("junction");
  const junction: Block = {
    id: junctionId,
    type: "routing.junction",
    paradigm: "routing",
    domain: existing.kind,
    fidelity: "n_a",
    position: [x, y],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
  };
  const wire = (parts: Omit<Wire, "id">): Wire => ({ id: newId("wire"), ...parts });
  return {
    junction,
    removeWireId: existing.id,
    wires: [
      // The tapped wire's two halves keep its own net and domain: tapping a conductor must not
      // change what it carries.
      wire({
        from: existing.from,
        to: { block: junctionId, port: "node" },
        waypoints: [[x, y]],
        pinned: false,
        net: existing.net,
        kind: existing.kind,
      }),
      wire({
        from: { block: junctionId, port: "node" },
        to: existing.to,
        waypoints: [[x, y]],
        pinned: false,
        net: existing.net,
        kind: existing.kind,
      }),
      wire({
        from: { block: draw.from.blockId, port: draw.from.portId },
        to: { block: junctionId, port: "node" },
        waypoints: [...draw.waypoints.map((p): [number, number] => [p.x, p.y]), [x, y]],
        pinned: false,
        net: existing.net,
        kind: draw.from.domain,
      }),
    ],
  };
}

/**
 * Wires already attached to the port a branch is drawn from.
 *
 * Excluded from the hit test: tapping the conductor you are drawing from would splice a
 * junction into your own branch and connect the port to itself.
 */
export function wiresAttachedTo(
  wires: readonly Wire[],
  from: { blockId: string; portId: string },
): Set<string> {
  return new Set(
    wires
      .filter(
        (wire) =>
          (wire.from.block === from.blockId && wire.from.port === from.portId) ||
          (wire.to.block === from.blockId && wire.to.port === from.portId),
      )
      .map((wire) => wire.id),
  );
}
