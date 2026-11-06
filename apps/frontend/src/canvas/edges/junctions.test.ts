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
    const wires = [wire("h", "a:n", "b:p", []), wire("v", "c:n", "d:p", [])];
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
    // Two junctions here, both real: the tap at (100,100), and (200,100)
    // where both wires terminate on b's pin — that pin's own lead makes three.
    expect(computeJunctions([rail, tap], tips)).toEqual(
      expect.arrayContaining([
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ]),
    );
  });

  it("dots a pin where two wires terminate — the component's lead is the third conductor", () => {
    // The everyday case: a capacitor tapping a rail that carries on to the
    // load. Both wires *end* on the cap's pin, so no wire has three vertices
    // anywhere and nothing bends onto a segment — yet three conductors meet.
    // This came out undotted while the identical node one component along,
    // formed by a bend instead, was dotted.
    const a = wire("a", "p1:n", "p2:p", []);
    const b = wire("b", "p2:p", "p3:p", []);
    const tips = endpoints({
      "p1:n": [0, 100],
      "p2:p": [100, 100],
      "p3:p": [100, 200],
    });
    expect(computeJunctions([a, b], tips)).toEqual([{ x: 100, y: 100 }]);
  });

  it("does not dot a pin where only one wire terminates", () => {
    // An ordinary two-conductor termination; Port.tsx already draws the
    // terminal there.
    const only = wire("a", "p1:n", "p2:p", []);
    const tips = endpoints({ "p1:n": [0, 100], "p2:p": [100, 100] });
    expect(computeJunctions([only], tips)).toEqual([]);
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

/**
 * A dot does not mean "these lines touch". It means "these conductors are one
 * node". Deciding it from coordinates alone put one wherever two unrelated
 * signals happened to cross — found on a real sheet where a `ctrl_phase` wire
 * crossed a `ctrl_duty` wire and the drawing claimed they were the same
 * signal.
 */
describe("a dot is only drawn within one electrical net", () => {
  it("leaves a crossing between two unrelated nets bare", () => {
    // Two wires that share no port and no net name, crossing at (100, 100):
    // one horizontal, one vertical through it.
    const wires = [
      wire("phase", "src1:out", "mod:phase", [
        [0, 100],
        [200, 100],
      ]),
      wire("duty", "src2:out", "mod:duty", [
        [100, 0],
        [100, 200],
      ]),
    ];
    expect(computeJunctions(wires)).toEqual([]);
  });

  it("still dots a T-tap when both wires are the same net", () => {
    // Same geometry, but now both wires leave the *same* driver port, which
    // is how fan-out is drawn — so the tap really is one node.
    const wires = [
      wire("a", "src:out", "mod:phase", [
        [0, 100],
        [200, 100],
      ]),
      wire("b", "src:out", "mod:duty", [
        [100, 100],
        [100, 200],
      ]),
    ];
    expect(computeJunctions(wires)).toEqual([{ x: 100, y: 100 }]);
  });

  it("treats an explicit shared net name as the same net", () => {
    const named = (id: string, from: string, to: string, pts: Point[], net: string) =>
      ({ ...wire(id, from, to, pts), net }) as Wire;
    // No shared port at all; only the net name joins them.
    const wires = [
      named(
        "a",
        "p:1",
        "q:1",
        [
          [0, 100],
          [200, 100],
        ],
        "VDCP",
      ),
      named(
        "b",
        "r:1",
        "s:1",
        [
          [100, 100],
          [100, 200],
        ],
        "VDCP",
      ),
    ];
    expect(computeJunctions(wires)).toEqual([{ x: 100, y: 100 }]);
  });

  it("does not join two pins of one component into a node", () => {
    // Both wires touch block `R1`, but at different pins. A resistor's two
    // terminals are not one node, so a wire crossing over it gets no dot.
    const wires = [
      wire("a", "R1:p", "x:p", [
        [0, 100],
        [200, 100],
      ]),
      wire("b", "R1:n", "y:p", [
        [100, 0],
        [100, 200],
      ]),
    ];
    expect(computeJunctions(wires)).toEqual([]);
  });
});
