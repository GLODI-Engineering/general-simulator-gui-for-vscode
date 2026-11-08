import { describe, expect, it } from "vitest";

import type { BlockMetadata } from "../model/types";
import { findUnknownPortRefs } from "./topology";

function meta(name: string, ports: string[], countFrom?: string): BlockMetadata {
  return {
    name,
    label: name,
    domain: "physical-electrical",
    ports: {
      inputs: ports.map((id) => ({ id, kind: { domain: "physical-electrical" } })),
      outputs: [],
      // How the schema says "this component's port count comes from a
      // parameter", so its declared list is a lower bound, not a contract.
      ...(countFrom
        ? {
            variadic_inputs: {
              count_from: countFrom,
              template: { id: "in", kind: { domain: "signal" } },
            },
          }
        : {}),
    },
    params: [],
  } as unknown as BlockMetadata;
}

const catalog = {
  "passive.resistor": meta("passive.resistor", ["p", "n"]),
  "routing.ground": meta("routing.ground", ["gnd"]),
  "control.sum": meta("control.sum", ["in0"], "signs"),
  "spice-subckt.instance": meta("spice-subckt.instance", ["a"]),
};

const wire = (id: string, from: [string, string], to: [string, string]) => ({
  id,
  from: { block: from[0], port: from[1] },
  to: { block: to[0], port: to[1] },
});

/**
 * A wire naming a port its block does not have is not refused: the renderer
 * falls back to a position and draws it somewhere plausible, so the sheet
 * looks connected. On a 68-block converter this hid 27 bad endpoints and 18
 * wires that were never drawn at all.
 */
describe("findUnknownPortRefs", () => {
  it("says nothing about a correct sheet", () => {
    const model = {
      blocks: [
        { id: "R1", type: "passive.resistor" },
        { id: "G1", type: "routing.ground" },
      ],
      wires: [wire("w1", ["R1", "n"], ["G1", "gnd"])],
    };
    expect(findUnknownPortRefs(model as never, catalog as never)).toEqual([]);
  });

  it("catches a ground wired to a port it does not have", () => {
    const model = {
      blocks: [
        { id: "R1", type: "passive.resistor" },
        { id: "G1", type: "routing.ground" },
      ],
      // The real defect: `p` instead of `gnd`.
      wires: [wire("w1", ["R1", "n"], ["G1", "p"])],
    };
    const issues = findUnknownPortRefs(model as never, catalog as never);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.summary).toContain('"p"');
    expect(issues[0]?.summary).toContain("gnd");
    expect(issues[0]?.blockId).toBe("G1");
  });

  it("catches passives wired p1/p2 when they have p/n", () => {
    const model = {
      blocks: [
        { id: "R1", type: "passive.resistor" },
        { id: "R2", type: "passive.resistor" },
      ],
      wires: [wire("w1", ["R1", "p2"], ["R2", "p1"])],
    };
    expect(findUnknownPortRefs(model as never, catalog as never)).toHaveLength(2);
  });

  /**
   * The false positives that would bury the real ones: these components
   * build their ports from a parameter and declare only the first.
   */
  it("leaves parameter-driven ports alone", () => {
    const model = {
      blocks: [{ id: "S1", type: "control.sum" }],
      wires: [wire("w1", ["S1", "in2"], ["S1", "in0"])],
    };
    expect(findUnknownPortRefs(model as never, catalog as never)).toEqual([]);
  });

  it("leaves subcircuit instances alone, whose ports are on another sheet", () => {
    const model = {
      blocks: [{ id: "X1", type: "spice-subckt.instance" }],
      wires: [wire("w1", ["X1", "ctrl_freq"], ["X1", "a"])],
    };
    expect(findUnknownPortRefs(model as never, catalog as never)).toEqual([]);
  });

  it("reports a wire pointing at a block that is not on the sheet", () => {
    const model = {
      blocks: [{ id: "R1", type: "passive.resistor" }],
      wires: [wire("w1", ["R1", "p"], ["ghost", "n"])],
    };
    const issues = findUnknownPortRefs(model as never, catalog as never);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.summary).toContain("not on the sheet");
  });

  it("says nothing about a component it does not know", () => {
    const model = {
      blocks: [{ id: "U1", type: "vendor.mystery" }],
      wires: [wire("w1", ["U1", "whatever"], ["U1", "other"])],
    };
    expect(findUnknownPortRefs(model as never, catalog as never)).toEqual([]);
  });
});
