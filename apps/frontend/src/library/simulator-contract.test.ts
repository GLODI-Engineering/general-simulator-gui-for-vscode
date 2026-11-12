import { describe, expect, it } from "vitest";

import { simulatorContract, supportsBlock } from "./simulator-compat";

/**
 * What this pins: the front end never answers "can the simulator run this?"
 * from a list of its own. It asks the engine's catalogue, which derives the
 * answer from the compile registry. The hand-written list that used to live
 * beside it drifted until it matched none of the catalogue's types, and every
 * block on every sheet reported unsupported.
 */
describe("simulator contract", () => {
  it("knows the configured simulator", () => {
    expect(simulatorContract("general-simulator")?.label).toBe("General Simulator");
  });

  it("has nothing to say about a simulator it does not know", () => {
    expect(simulatorContract("ngspice")).toBeUndefined();
  });
});

describe("supportsBlock", () => {
  it("accepts a block the engine declares it compiles", () => {
    expect(supportsBlock("general-simulator", "physical-electrical.passive.resistor")).toBe(true);
  });

  it("refuses one the engine does not", () => {
    expect(supportsBlock("general-simulator", "physical-electrical.semiconductor.mosfet_n")).toBe(
      false,
    );
  });

  it("refuses a type the engine has never heard of", () => {
    expect(supportsBlock("general-simulator", "not.a.real.block")).toBe(false);
  });

  /** "all" is the palette's browse-everything mode, not a simulator. */
  it("accepts everything in browse-all mode", () => {
    expect(supportsBlock("all", "physical-electrical.semiconductor.mosfet_n")).toBe(true);
  });

  it("does not block work for an unconfigured simulator", () => {
    expect(supportsBlock("ngspice", "anything.at.all")).toBe(true);
  });
});
