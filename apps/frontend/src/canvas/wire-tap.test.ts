import { describe, expect, it } from "vitest";

import type { Wire } from "../model/types";
import {
  type ResolveEndpoint,
  findWireNear,
  junctionSplice,
  wirePolyline,
  wiresAttachedTo,
} from "./wire-tap";

const CENTERS: Record<string, { x: number; y: number }> = {
  "A:out": { x: 0, y: 0 },
  "B:in": { x: 100, y: 0 },
  "C:out": { x: 0, y: 60 },
  "D:in": { x: 100, y: 80 },
  "E:out": { x: 40, y: 200 },
};
const resolve: ResolveEndpoint = ({ block, port }) => CENTERS[`${block}:${port}`] ?? null;

function wire(id: string, from: string, to: string, waypoints: Array<[number, number]> = []): Wire {
  const [fb, fp] = from.split(":");
  const [tb, tp] = to.split(":");
  return {
    id,
    from: { block: fb as string, port: fp as string },
    to: { block: tb as string, port: tp as string },
    waypoints,
    pinned: false,
    net: `net-${id}`,
    kind: "physical-electrical",
  };
}

describe("the polyline a wire is drawn as", () => {
  it("is the straight run when the ends share an axis", () => {
    expect(wirePolyline(wire("w1", "A:out", "B:in"), resolve)).toEqual([
      [0, 0],
      [100, 0],
    ]);
  });

  it("includes the implied elbow when they do not", () => {
    // Hit-testing the straight line between the endpoints would miss this wire along both of
    // its actual legs, which is the whole reason the elbow is reconstructed here.
    expect(wirePolyline(wire("w2", "C:out", "D:in"), resolve)).toEqual([
      [0, 60],
      [100, 60],
      [100, 80],
    ]);
  });

  it("is null when an endpoint cannot be resolved", () => {
    expect(wirePolyline(wire("w3", "A:out", "ghost:in"), resolve)).toBeNull();
  });
});

describe("finding the wire under a release", () => {
  const wires = [wire("w1", "A:out", "B:in"), wire("w2", "C:out", "D:in")];

  it("finds a wire the release landed near", () => {
    const hit = findWireNear(wires, resolve, { x: 50, y: 4 }, 20, 10);
    expect(hit?.wire.id).toBe("w1");
    // On the wire, not snapped away from it: y stays 0 while x snaps along the run.
    expect(hit?.at).toEqual([50, 0]);
  });

  it("keeps the junction on the conductor rather than on the grid", () => {
    // Snapping both coordinates would lift the junction off the wire by up to half a grid
    // step and leave a visible gap at the tap.
    const hit = findWireNear(wires, resolve, { x: 53, y: 6 }, 20, 20);
    expect(hit?.at?.[1]).toBe(0);
    expect(hit?.at?.[0]).toBe(60);
  });

  it("ignores a release beyond the end of a wire", () => {
    // Clamped projection: without it, a release far past B would still match the infinite line
    // through A and B.
    expect(findWireNear(wires, resolve, { x: 400, y: 0 }, 20, 10)).toBeNull();
  });

  it("ignores a release too far from any wire", () => {
    // Midway between the two runs (y=0 and y=60), 30 from each, so neither is within 20.
    expect(findWireNear(wires, resolve, { x: 50, y: 30 }, 20, 10)).toBeNull();
  });

  it("picks the nearest when two are in range", () => {
    const close = findWireNear(wires, resolve, { x: 50, y: 45 }, 60, 10);
    expect(close?.wire.id).toBe("w2");
  });

  it("finds a wire along the second leg of an elbow", () => {
    const hit = findWireNear([wires[1] as Wire], resolve, { x: 97, y: 75 }, 20, 10);
    expect(hit?.wire.id).toBe("w2");
    // On the vertical leg, so x is fixed at 100 and y snaps along it.
    expect(hit?.at?.[0]).toBe(100);
  });

  it("skips the wires excluded from the search", () => {
    const excluded = new Set(["w1"]);
    expect(findWireNear(wires, resolve, { x: 50, y: 4 }, 20, 10, excluded)).toBeNull();
  });
});

describe("wires attached to the drawing port", () => {
  it("names every wire already on that port, either end", () => {
    const wires = [
      wire("w1", "A:out", "B:in"),
      wire("w2", "C:out", "A:out"),
      wire("w3", "C:out", "D:in"),
    ];
    // Tapping the conductor you are drawing from would splice a junction into your own branch
    // and connect the port to itself.
    expect(wiresAttachedTo(wires, { blockId: "A", portId: "out" })).toEqual(new Set(["w1", "w2"]));
  });
});

describe("splicing a junction into a tapped wire", () => {
  const tapped = wire("w1", "A:out", "B:in");
  const draw = {
    from: { blockId: "E", portId: "out", domain: "physical-electrical" as const },
    waypoints: [{ x: 40, y: 120 }],
  };
  let n = 0;
  const ids = (kind: "junction" | "wire") => `${kind}-${++n}`;

  it("replaces one wire with the two halves and the branch", () => {
    n = 0;
    const splice = junctionSplice(tapped, [50, 0], draw, ids);
    expect(splice.removeWireId).toBe("w1");
    expect(splice.wires).toHaveLength(3);
    expect(splice.junction.type).toBe("routing.junction");
    expect(splice.junction.position).toEqual([50, 0]);

    const [first, second, branch] = splice.wires;
    expect(first?.from).toEqual(tapped.from);
    expect(first?.to).toEqual({ block: splice.junction.id, port: "node" });
    expect(second?.from).toEqual({ block: splice.junction.id, port: "node" });
    expect(second?.to).toEqual(tapped.to);
    expect(branch?.from).toEqual({ block: "E", port: "out" });
    expect(branch?.to).toEqual({ block: splice.junction.id, port: "node" });
  });

  it("leaves the tapped conductor carrying what it carried", () => {
    n = 0;
    const splice = junctionSplice(tapped, [50, 0], draw, ids);
    for (const half of splice.wires.slice(0, 2)) {
      expect(half.net).toBe(tapped.net);
      expect(half.kind).toBe(tapped.kind);
    }
    expect(splice.junction.domain).toBe(tapped.kind);
  });

  it("keeps the branch's own waypoints and ends at the junction", () => {
    n = 0;
    const branch = junctionSplice(tapped, [50, 0], draw, ids).wires[2];
    expect(branch?.waypoints).toEqual([
      [40, 120],
      [50, 0],
    ]);
  });
});
