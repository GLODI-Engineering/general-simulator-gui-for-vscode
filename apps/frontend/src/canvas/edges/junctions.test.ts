import { describe, expect, it } from "vitest";

import type { Wire } from "../../model/types";
import { type Point, computeJunctions } from "./junctions";

function wire(id: string, from: string, to: string, waypoints: Point[]): Wire {
  const [fromBlock, fromPort] = from.split(":");
  const [toBlock, toPort] = to.split(":");
  return {
    id,
    from: { block: fromBlock as string, port: fromPort as string },
    to: { block: toBlock as string, port: toPort as string },
    waypoints,
    pinned: false,
    net: null,
    kind: "physical-electrical",
  } as Wire;
}

/** Endpoint table keyed `block:port`, the shape Canvas.tsx builds from port lead tips. */
function endpoints(tips: Record<string, Point>) {
  return (w: Wire) => {
    const from = tips[`${w.from.block}:${w.from.port}`];
    const to = tips[`${w.to.block}:${w.to.port}`];
    return from && to ? ([from, to] as [Point, Point]) : null;
  };
}

describe("computeJunctions", () => {
  it("finds nothing on an empty sheet", () => {
    expect(computeJunctions([])).toEqual([]);
  });

  it("dots a point where three wire vertices coincide", () => {
    const wires = [
      wire("a", "x:p", "y:p", [[100, 100]]),
      wire("b", "x:p", "z:p", [[100, 100]]),
      wire("c", "x:p", "w:p", [[100, 100]]),
    ];
    expect(computeJunctions(wires)).toEqual([{ x: 100, y: 100 }]);
  });

  it("does not dot two wires that merely cross", () => {
    // A horizontal and a vertical wire through the same point, neither with a
    // vertex there: on a schematic that is a crossing, not a connection.
    const wires = [
      wire("h", "a:n", "b:p", []),
      wire("v", "c:n", "d:p", []),
    ];
    const tips = endpoints({
      "a:n": [0, 100],
      "b:p": [200, 100],
      "c:n": [100, 0],
      "d:p": [100, 200],
    });
    expect(computeJunctions(wires, tips)).toEqual([]);
  });

  it("dots a three-way node formed by wires that END at the same port", () => {
    // The common case, and the one waypoint-only counting could never see:
    // no wire has three vertices anywhere.
    const wires = [
      wire("in", "src:n", "node:p", []),
      wire("out1", "node:p", "r1:p", []),
      wire("out2", "node:p", "r2:p", []),
    ];
    const tips = endpoints({
      "src:n": [0, 100],
      "node:p": [100, 100],
      "r1:p": [200, 100],
      "r2:p": [100, 200],
    });
    expect(computeJunctions(wires, tips)).toEqual([{ x: 100, y: 100 }]);
  });

  it("dots a T — a wire bending onto the interior of another wire's segment", () => {
    // How a rail is tapped. The straight wire has no vertex at the tap point.
    const rail = wire("rail", "a:n", "b:p", []);
    const tap = wire("tap", "c:k", "b:p", [[100, 100]]);
    const tips = endpoints({
      "a:n": [0, 100],
      "b:p": [200, 100],
      "c:k": [100, 300],
    });
    expect(computeJunctions([rail, tap], tips)).toEqual([{ x: 100, y: 100 }]);
  });

  it("does not dot a vertex sitting on another wire's endpoint-only extremity", () => {
    // Touching the very end of a segment is the port case, not a tap: the
    // terminal is already drawn there.
    const a = wire("a", "p1:n", "p2:p", []);
    const b = wire("b", "p2:p", "p3:p", []);
    const tips = endpoints({
      "p1:n": [0, 100],
      "p2:p": [100, 100],
      "p3:p": [100, 200],
    });
    expect(computeJunctions([a, b], tips)).toEqual([]);
  });

  it("reports each junction once, however many wires meet there", () => {
    const wires = [
      wire("a", "x:p", "y:p", [[40, 40]]),
      wire("b", "x:p", "z:p", [[40, 40]]),
      wire("c", "x:p", "w:p", [[40, 40]]),
      wire("d", "x:p", "v:p", [[40, 40]]),
    ];
    expect(computeJunctions(wires)).toEqual([{ x: 40, y: 40 }]);
  });
});
