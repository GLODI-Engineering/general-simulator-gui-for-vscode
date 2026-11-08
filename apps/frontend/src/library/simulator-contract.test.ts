import { describe, expect, it } from "vitest";

import { allowedModelLevels, simulatorContract, supportsBlock } from "./simulator-compat";

/**
 * The gap this closes: knowing a simulator supports a resistor says nothing
 * about whether it can run a semiconductor resistance model. Every level of
 * every device was offered to every simulator, labelled with which simulator
 * it belonged to and otherwise unguarded — so a sheet targeting a solver
 * that models switches as ideal was still shown ngspice's SW and CSW model
 * cards, whose parameters would be dropped on the way to the netlist.
 */
describe("simulator contract", () => {
  it("knows the configured simulator", () => {
    const contract = simulatorContract("general-simulator");
    expect(contract?.label).toBe("General Simulator");
    expect(contract?.supported).toContain("passive.switch.ideal");
  });

  it("has nothing to say about a simulator it does not know", () => {
    expect(simulatorContract("ngspice")).toBeUndefined();
  });
});

describe("supportsBlock", () => {
  it("accepts a block the simulator compiles", () => {
    expect(supportsBlock("general-simulator", "passive.resistor")).toBe(true);
  });

  it("refuses one it does not", () => {
    expect(supportsBlock("general-simulator", "physical_electrical.semiconductor.mosfet_n")).toBe(
      false,
    );
  });

  /** "all" is the palette's browse-everything mode, not a simulator. */
  it("accepts everything in browse-all mode", () => {
    expect(supportsBlock("all", "physical_electrical.semiconductor.mosfet_n")).toBe(true);
  });

  it("does not block work for an unconfigured simulator", () => {
    expect(supportsBlock("ngspice", "anything.at.all")).toBe(true);
  });
});

describe("allowedModelLevels", () => {
  /**
   * General Simulator's netlist compiler has no `.MODEL` card concept, so no
   * level of any family is available — the devices it has are ideal.
   */
  it("offers no model level for a simulator that models devices as ideal", () => {
    expect(allowedModelLevels("general-simulator", "switch", [1, 2, 3])).toEqual([]);
    expect(allowedModelLevels("general-simulator", "resistor", [0, 1])).toEqual([]);
  });

  it("offers nothing for a family the simulator does not have at all", () => {
    expect(allowedModelLevels("general-simulator", "mosfet", [1, 2, 3, 14])).toEqual([]);
  });

  /**
   * Hiding levels from someone who has not chosen a target is worse than
   * showing one they cannot run — they have not said what they are aiming at.
   */
  it("offers every level in browse-all mode", () => {
    expect(allowedModelLevels("all", "mosfet", [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("offers every level for a simulator with no contract yet", () => {
    expect(allowedModelLevels("ngspice", "mosfet", [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("keeps the order it was given, so the panel's list does not shuffle", () => {
    expect(allowedModelLevels("all", "bjt", [4, 1, 9])).toEqual([4, 1, 9]);
  });
});
