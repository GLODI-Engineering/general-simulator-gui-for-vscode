/**
 * FE-99 — Wire attachment, live stretch and end-segment reroute on block move,
 * plus the FE-20 port-facing bias threaded through both entry points.
 */

import { describe, expect, it } from "vitest";

import type { Wire } from "../../model/types";
import {
  type PortWireSnapshot,
  rerouteEndSegment,
  snapshotPortWires,
  stretchAttachedWires,
} from "./attachment";
import type { ObstacleBox } from "./obstacles";
import type { Point } from "./ortho-route";

function isOrthogonal(points: Point[]): boolean {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) return false;
    if (a[0] !== b[0] && a[1] !== b[1]) return false;
  }
  return true;
}

function axis(a: Point, b: Point): "h" | "v" | null {
  if (a[0] === b[0] && a[1] === b[1]) return null;
  return a[0] === b[0] ? "v" : "h";
}

function firstAxis(points: Point[]): "h" | "v" | null {
  const a = points[0];
  const b = points[1];
  return a && b ? axis(a, b) : null;
}

function lastAxis(points: Point[]): "h" | "v" | null {
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  return a && b ? axis(a, b) : null;
}

function wire(waypoints: Point[]): Wire {
  return {
    id: "w1",
    from: { block: "b1", port: "out" },
    to: { block: "b2", port: "in" },
    waypoints: waypoints.map(([x, y]) => [x, y] as [number, number]),
    pinned: false,
    net: null,
    kind: "signal",
  };
}

describe("FE-99: rerouteEndSegment", () => {
  it("test_orthogonality_preserved: a diagonal endpoint move is re-orthogonalised", () => {
    const out = rerouteEndSegment(
      [
        [0, 0],
        [80, 60],
      ],
      "first",
    );
    expect(isOrthogonal(out)).toBe(true);
  });

  it("test_reroute_on_overlap: a blocked end segment is rerouted clear of the obstacle", () => {
    const obstacles: ObstacleBox[] = [{ x: 20, y: -30, w: 40, h: 60 }];
    const out = rerouteEndSegment(
      [
        [0, 0],
        [100, 0],
        [100, 80],
      ],
      "first",
      obstacles,
    );
    expect(isOrthogonal(out)).toBe(true);
  });
});

describe("FE-20: rerouteEndSegment honours the port's facing axis", () => {
  it("bends the leading segment onto the port axis when it would leave sideways", () => {
    const points: Point[] = [
      [0, 0],
      [120, 0],
      [120, 90],
    ];
    // Untouched, this route leaves horizontally.
    expect(firstAxis(rerouteEndSegment(points, "first"))).toBe("h");
    // A top/bottom-facing port must leave vertically instead.
    expect(firstAxis(rerouteEndSegment(points, "first", [], "v"))).toBe("v");
    // An already-correct facing is a no-op.
    expect(rerouteEndSegment(points, "first", [], "h")).toEqual(rerouteEndSegment(points, "first"));
  });

  it("bends the trailing segment so the wire arrives along the target port axis", () => {
    const points: Point[] = [
      [0, 0],
      [0, 90],
      [120, 90],
    ];
    expect(lastAxis(rerouteEndSegment(points, "last"))).toBe("h");
    expect(lastAxis(rerouteEndSegment(points, "last", [], "v"))).toBe("v");
  });

  it("keeps the wire orthogonal and both endpoints fixed while doing so", () => {
    for (const end of ["first", "last"] as const) {
      for (const dir of ["h", "v"] as const) {
        const points: Point[] = [
          [0, 0],
          [60, 0],
          [60, 40],
          [140, 40],
        ];
        const out = rerouteEndSegment(points, end, [], dir);
        expect(isOrthogonal(out)).toBe(true);
        expect(out[0]).toEqual([0, 0]);
        expect(out[out.length - 1]).toEqual([140, 40]);
      }
    }
  });
});

describe("FE-99/FE-20: snapshotPortWires + stretchAttachedWires", () => {
  it("carries each endpoint's facing axis into the snapshot", () => {
    const snaps = snapshotPortWires(
      [
        wire([
          [0, 0],
          [120, 0],
          [120, 90],
        ]),
      ],
      new Set(["b1", "b2"]),
      (blockId) => (blockId === "b1" ? "v" : "h"),
    );
    expect(snaps.map((s) => [s.blockId, s.exitDir])).toEqual([
      ["b1", "v"],
      ["b2", "h"],
    ]);
  });

  it("test_single_wire_follows: the moved end translates and the far end stays put", () => {
    const w = wire([
      [0, 0],
      [120, 0],
      [120, 90],
    ]);
    const snaps: PortWireSnapshot[] = snapshotPortWires([w], new Set(["b1"]));
    const [out] = stretchAttachedWires([w], snaps, [20, 20]);
    expect(out?.waypoints[0]).toEqual([20, 20]);
    expect(out?.waypoints[(out?.waypoints.length ?? 1) - 1]).toEqual([120, 90]);
  });

  it("the stretched wire leaves the moved port along its facing axis", () => {
    const w = wire([
      [0, 0],
      [120, 0],
      [120, 90],
    ]);
    const snaps = snapshotPortWires([w], new Set(["b1"]), () => "v");
    const [out] = stretchAttachedWires([w], snaps, [20, 20]);
    const pts = (out?.waypoints ?? []) as Point[];
    expect(isOrthogonal(pts)).toBe(true);
    expect(firstAxis(pts)).toBe("v");
  });
});
