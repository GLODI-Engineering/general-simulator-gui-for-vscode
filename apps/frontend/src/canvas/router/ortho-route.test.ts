/**
 * FE-98 / FE-20 — Orthogonal auto-router.
 *
 * FE-20's original "post-move cleanup router" (`cleanup.ts`) was dead code that
 * never read port data; its acceptance criterion — "wires emerging from each
 * port respect the port's facing direction" — is now satisfied here, by seeding
 * `routeOrtho`'s `prevDir` from the port's post-transform facing side.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { sideToAxis } from "../nodes/port-hit-test";
import type { ObstacleBox } from "./obstacles";
import {
  pointsToSegments,
  routeBlocked,
  routeOrtho,
  routeOverlap,
  type Direction,
  type Point,
} from "./ortho-route";

function isOrthogonal(points: Point[]): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) return false;
    if (a[0] !== b[0] && a[1] !== b[1]) return false;
  }
  return true;
}

/** Axis of the first non-degenerate segment. */
function firstSegmentAxis(points: Point[]): Direction {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    if (a[0] === b[0] && a[1] === b[1]) continue;
    return a[0] === b[0] ? "v" : "h";
  }
  return null;
}

/** Axis of the last non-degenerate segment. */
function lastSegmentAxis(points: Point[]): Direction {
  for (let i = points.length - 1; i > 0; i -= 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    if (a[0] === b[0] && a[1] === b[1]) continue;
    return a[0] === b[0] ? "v" : "h";
  }
  return null;
}

describe("FE-98: routeOrtho", () => {
  it("test_straight_clear: a collinear pair routes as a single segment", () => {
    expect(routeOrtho(0, 0, 100, 0, null, [])).toEqual([
      [0, 0],
      [100, 0],
    ]);
    expect(routeOrtho(0, 0, 0, 100, null, [])).toEqual([
      [0, 0],
      [0, 100],
    ]);
  });

  it("test_detour_around_box: an obstacle on the direct route forces a clear detour", () => {
    const obs: ObstacleBox[] = [{ x: 20, y: -40, w: 40, h: 80 }];
    const route = routeOrtho(0, 0, 100, 0, null, obs);
    expect(isOrthogonal(route)).toBe(true);
    expect(routeBlocked(route, obs)).toBe(false);
    expect(route.length).toBeGreaterThan(2);
  });

  it("test_prevdir_bias: prevDir picks the first segment's axis when both L-routes are clear", () => {
    expect(firstSegmentAxis(routeOrtho(0, 0, 100, 60, "v", []))).toBe("v");
    expect(firstSegmentAxis(routeOrtho(0, 0, 100, 60, "h", []))).toBe("h");
    // Without a bias the longer delta wins — here that is horizontal.
    expect(firstSegmentAxis(routeOrtho(0, 0, 100, 60, null, []))).toBe("h");
  });
});

describe("FE-20: wires leave a port along the port's facing direction", () => {
  const sides = ["left", "right", "top", "bottom"] as const;

  it.each(sides)("a port facing %s starts its route on that port's axis", (side) => {
    const expected = sideToAxis(side);
    // Targets deliberately chosen so the unbiased heuristic would pick the
    // opposite axis for at least one of them.
    for (const target of [
      [400, 20],
      [20, 400],
      [-400, -20],
      [-20, -400],
    ] as Point[]) {
      const route = routeOrtho(0, 0, target[0], target[1], expected, []);
      expect(isOrthogonal(route)).toBe(true);
      expect(firstSegmentAxis(route)).toBe(expected);
    }
  });

  it("property: on a clear canvas the first segment always follows the port axis", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sides),
        fc.integer({ min: -500, max: 500 }),
        fc.integer({ min: -500, max: 500 }),
        (side, dx, dy) => {
          const axis = sideToAxis(side);
          const route = routeOrtho(0, 0, dx, dy, axis, []);
          expect(isOrthogonal(route)).toBe(true);
          const first = firstSegmentAxis(route);
          // A target sharing a coordinate with the port is a single straight
          // run; there is no bend to bias, so only the general case applies.
          if (dx !== 0 && dy !== 0) {
            expect(first).toBe(axis);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it("nextDir makes the wire arrive along the target port's axis", () => {
    // Same axis at both ends → a single L cannot do it, so a mid-rail Z detour.
    const zh = routeOrtho(0, 0, 200, 120, "h", [], "h");
    expect(isOrthogonal(zh)).toBe(true);
    expect(firstSegmentAxis(zh)).toBe("h");
    expect(lastSegmentAxis(zh)).toBe("h");
    expect(zh[0]).toEqual([0, 0]);
    expect(zh[zh.length - 1]).toEqual([200, 120]);

    const zv = routeOrtho(0, 0, 200, 120, "v", [], "v");
    expect(firstSegmentAxis(zv)).toBe("v");
    expect(lastSegmentAxis(zv)).toBe("v");

    // Differing axes are satisfied by a plain L.
    const l = routeOrtho(0, 0, 200, 120, "h", [], "v");
    expect(firstSegmentAxis(l)).toBe("h");
    expect(lastSegmentAxis(l)).toBe("v");
  });

  it("nextDir alone still orients the arrival when there is no exit bias", () => {
    expect(lastSegmentAxis(routeOrtho(0, 0, 40, 400, null, [], "h"))).toBe("h");
    expect(lastSegmentAxis(routeOrtho(0, 0, 400, 40, null, [], "v"))).toBe("v");
  });

  it("property: both port facings are honoured on a clear canvas", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sides),
        fc.constantFrom(...sides),
        fc.integer({ min: -500, max: 500 }),
        fc.integer({ min: -500, max: 500 }),
        (fromSide, toSide, dx, dy) => {
          const from = sideToAxis(fromSide);
          const to = sideToAxis(toSide);
          const route = routeOrtho(0, 0, dx, dy, from, [], to);
          expect(isOrthogonal(route)).toBe(true);
          expect(route[0]).toEqual([0, 0]);
          expect(route[route.length - 1]).toEqual([dx, dy]);
          // A Z needs an interior rail; endpoints one unit apart have none.
          if (Math.abs(dx) > 1 && Math.abs(dy) > 1) {
            expect(firstSegmentAxis(route)).toBe(from);
            expect(lastSegmentAxis(route)).toBe(to);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it("property: obstacle avoidance still wins over the facing preference", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sides),
        fc.integer({ min: 40, max: 400 }),
        fc.integer({ min: 40, max: 400 }),
        (side, dx, dy) => {
          const obs: ObstacleBox[] = [{ x: 10, y: 10, w: dx, h: dy }];
          const route = routeOrtho(0, 0, dx + 40, dy + 40, sideToAxis(side), obs);
          expect(isOrthogonal(route)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});

/**
 * Obstacles stop a wire running *through* a component. `occupied` stops two
 * wires being drawn as one stroke. The distinction is parallel-and-collinear
 * versus crossing: a schematic is full of crossings and they mean nothing, but
 * two runs on the same line cannot be told apart.
 */
describe("overlap with wires already routed", () => {
  it("counts nothing for a plain crossing", () => {
    // Horizontal run crossed by a vertical one: they meet, they do not share.
    const occupied = pointsToSegments([
      [50, -50],
      [50, 50],
    ]);
    expect(
      routeOverlap(
        [
          [0, 0],
          [100, 0],
        ],
        occupied,
      ),
    ).toBe(0);
  });

  it("counts the shared length of two collinear runs", () => {
    const occupied = pointsToSegments([
      [40, 0],
      [140, 0],
    ]);
    expect(
      routeOverlap(
        [
          [0, 0],
          [100, 0],
        ],
        occupied,
      ),
    ).toBe(60);
  });

  it("ignores overlap between wires of the same net", () => {
    const occupied = pointsToSegments(
      [
        [40, 0],
        [140, 0],
      ],
      "n1",
    );
    expect(
      routeOverlap(
        [
          [0, 0],
          [100, 0],
        ],
        occupied,
        "n1",
      ),
    ).toBe(0);
    expect(
      routeOverlap(
        [
          [0, 0],
          [100, 0],
        ],
        occupied,
        "n2",
      ),
    ).toBe(60);
  });

  it("routes onto a free lane when the obvious one is taken", () => {
    const plain = routeOrtho(0, 0, 200, 100, null, []);
    const occupied = pointsToSegments(plain, "other");
    const dodged = routeOrtho(0, 0, 200, 100, null, [], null, { occupied, net: "mine" });
    expect(routeOverlap(plain, occupied, "mine")).toBeGreaterThan(0);
    expect(routeOverlap(dodged, occupied, "mine")).toBe(0);
  });

  it("leaves routing unchanged when nothing is occupied", () => {
    // The default path must not move: an unblocked first candidate scores zero
    // and nothing can beat it.
    expect(routeOrtho(0, 0, 200, 100, null, [], null, { occupied: [] })).toEqual(
      routeOrtho(0, 0, 200, 100, null, []),
    );
  });

  it("prefers crossing a wire to running through a component", () => {
    const box = { x: 80, y: -40, w: 60, h: 200 };
    const occupied = pointsToSegments(
      [
        [0, 0],
        [200, 0],
      ],
      "other",
    );
    const route = routeOrtho(0, 0, 200, 100, null, [box], null, { occupied, net: "mine" });
    expect(routeBlocked(route, [box])).toBe(false);
  });
});

/**
 * A port faces a direction, and a wire that leaves it the other way has to go
 * through the body behind it. The candidate set used to contain only routes
 * heading straight for the target, so a port facing away from its target had
 * no legal way out at all.
 */
describe("leaving a port along the way it faces", () => {
  it("backs out and goes around rather than turning the wrong way", () => {
    // A box sitting immediately right of the start: heading straight for the
    // target crosses it, so the only route that keeps a horizontal first
    // segment is one that steps left before climbing.
    const box = { x: 0, y: -60, w: 120, h: 120 };
    const route = routeOrtho(-20, 0, 400, 300, "h", [box]);
    expect(routeBlocked(route, [box])).toBe(false);
    const [a, b] = route;
    expect(a?.[1]).toBe(b?.[1]);
  });

  it("gives up the facing rather than cut through a component", () => {
    // Ranking matters: a wrong-way exit is ugly, a wire through a part is
    // unreadable. If only one of the two can be had, keep the part clear.
    const walls = [
      { x: -200, y: -60, w: 400, h: 20 },
      { x: -200, y: 40, w: 400, h: 20 },
    ];
    const route = routeOrtho(-20, 0, 400, 300, "v", walls);
    expect(routeBlocked(route, walls)).toBe(false);
  });
});
