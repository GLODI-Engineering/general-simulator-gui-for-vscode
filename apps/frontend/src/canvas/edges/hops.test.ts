import { describe, expect, it } from "vitest";

import type { Wire } from "../../model/types";
import { computeHops } from "./hops";

const wire = (
  id: string,
  from: [string, string],
  to: [string, string],
  waypoints: Array<[number, number]> = [],
  net: string | null = null,
): Wire =>
  ({
    id,
    from: { block: from[0], port: from[1] },
    to: { block: to[0], port: to[1] },
    waypoints,
    pinned: false,
    net,
    kind: "electrical",
  }) as unknown as Wire;

/** A horizontal wire across the middle, and a vertical one through it. */
const across = wire("h1", ["a", "p"], ["b", "p"]);
const down = wire("v1", ["c", "p"], ["d", "p"]);
const ends = (w: Wire): [[number, number], [number, number]] =>
  w.id === "h1"
    ? [
        [0, 50],
        [100, 50],
      ]
    : [
        [50, 0],
        [50, 100],
      ];

describe("stepping over a wire that is not connected", () => {
  it("marks the crossing on the horizontal wire only", () => {
    // Which of the two hops is arbitrary, but it has to be the same choice at
    // every crossing, or a long wire would bob over some and dive under
    // others as though the difference meant something.
    const hops = computeHops([across, down], ends);
    expect(hops.get("h1")?.map((h) => h.at)).toEqual([[50, 50]]);
    expect(hops.get("v1")).toBeUndefined();
  });

  it("draws nothing where the two wires share a net", () => {
    // Same net crossing itself is a node, and a node is a dot.
    const a = { ...across, net: "n1" } as Wire;
    const b = { ...down, net: "n1" } as Wire;
    expect(computeHops([a, b], ends).size).toBe(0);
  });

  it("draws nothing where a wire merely ends on another", () => {
    // A tee is a connection, not a crossing: the junction dots own it.
    const tee = (w: Wire): [[number, number], [number, number]] =>
      w.id === "h1"
        ? [
            [0, 50],
            [100, 50],
          ]
        : [
            [50, 50],
            [50, 100],
          ];
    expect(computeHops([across, down], tee).size).toBe(0);
  });
});
