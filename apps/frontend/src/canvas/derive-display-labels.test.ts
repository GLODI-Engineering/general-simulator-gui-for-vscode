import { describe, expect, it } from "vitest";

import type { Block } from "../model/types";
import { deriveDisplayLabels } from "./derive-flow-state";

function block(id: string, type: string, label?: string, paradigm = "physical-network"): Block {
  return {
    id,
    type,
    paradigm,
    domain: "physical-electrical",
    fidelity: "ideal",
    position: [0, 0],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
    ...(label ? { label } : {}),
  } as Block;
}

describe("deriveDisplayLabels", () => {
  it("numbers each part family independently, in document order", () => {
    const labels = deriveDisplayLabels([
      block("a", "passive.resistor"),
      block("b", "passive.capacitor"),
      block("c", "passive.resistor"),
      block("d", "passive.inductor"),
    ]);
    expect(labels.get("a")).toBe("R1");
    expect(labels.get("b")).toBe("C1");
    expect(labels.get("c")).toBe("R2");
    expect(labels.get("d")).toBe("L1");
  });

  it("keeps an authored label instead of inventing one", () => {
    const labels = deriveDisplayLabels([block("a", "passive.resistor", "Rsense")]);
    expect(labels.get("a")).toBe("Rsense");
  });

  it("steps over a designator the author already used", () => {
    // Deriving R1 here would collide with the hand-named R1 later in the sheet.
    const labels = deriveDisplayLabels([
      block("a", "passive.resistor"),
      block("b", "passive.resistor", "R1"),
    ]);
    expect(labels.get("a")).toBe("R2");
    expect(labels.get("b")).toBe("R1");
  });

  it("leaves signal-flow blocks alone", () => {
    // Their symbol already prints the type's caption, which says more.
    const labels = deriveDisplayLabels([block("a", "control.pid", undefined, "signal-flow")]);
    expect(labels.has("a")).toBe(false);
  });

  it("does not designate grounds, junctions or probes", () => {
    const labels = deriveDisplayLabels([
      block("g", "physical-electrical.reference.ground"),
      block("j", "routing.junction"),
      block("p", "sinks.probe"),
    ]);
    expect(labels.size).toBe(0);
  });

  it("is stable: the same document yields the same designators", () => {
    const blocks = [
      block("a", "passive.resistor"),
      block("b", "passive.resistor"),
      block("c", "physical-electrical.semiconductor.diode"),
    ];
    expect([...deriveDisplayLabels(blocks)]).toEqual([...deriveDisplayLabels(blocks)]);
    expect(deriveDisplayLabels(blocks).get("c")).toBe("D1");
  });
});
