import { describe, expect, it } from "vitest";

import type { Block, Model } from "../model/types";
import { FILE_SOURCE_TYPE, fileSourceBlockIds, isFileSourceType, measuredLabel } from "./measured";

function block(id: string, type: string, subsystem?: Model): Block {
  return {
    id,
    type,
    paradigm: "signal-flow",
    domain: "signal",
    fidelity: "ideal",
    position: [0, 0],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
    ...(subsystem ? { subsystem } : {}),
  };
}

function model(blocks: Block[]): Model {
  return {
    name: "m",
    blocks,
    wires: [],
    nets: [],
    annotations: [],
    params: {},
    metadata: {},
  } as unknown as Model;
}

describe("isFileSourceType", () => {
  it("accepts the canonical name", () => {
    expect(isFileSourceType(FILE_SOURCE_TYPE)).toBe(true);
  });

  it("accepts a spelling the catalogue lists as an alias", () => {
    // The catalogue's own aliases for `source.file`. A document that never
    // went through `deserialize` can still carry one of these.
    expect(isFileSourceType("filewave")).toBe(true);
    expect(isFileSourceType("capture")).toBe(true);
  });

  it("refuses another source, and a name nothing answers to", () => {
    expect(isFileSourceType("source.voltage.dc")).toBe(false);
    expect(isFileSourceType("source.filename")).toBe(false);
    expect(isFileSourceType("")).toBe(false);
  });
});

describe("fileSourceBlockIds", () => {
  it("finds the captures and nothing else", () => {
    const ids = fileSourceBlockIds([
      block("scope", FILE_SOURCE_TYPE),
      block("v1", "source.voltage.dc"),
      block("r1", "passive.resistor"),
    ]);
    expect([...ids]).toEqual(["scope"]);
  });

  it("looks inside a subsystem body", () => {
    // A capture dropped into a group is still a capture, and the signal it
    // produces reaches the viewer by the same route.
    const inner = model([block("inner-scope", FILE_SOURCE_TYPE), block("g1", "math.gain")]);
    const ids = fileSourceBlockIds([block("group", "hierarchy.subsystem", inner)]);
    expect([...ids]).toEqual(["inner-scope"]);
  });

  it("is empty for a sheet with no capture on it", () => {
    expect(fileSourceBlockIds([block("r1", "passive.resistor")]).size).toBe(0);
    expect(fileSourceBlockIds([]).size).toBe(0);
  });
});

describe("measuredLabel", () => {
  it("says what the trace is", () => {
    expect(measuredLabel("V_out")).toBe("V_out (measured)");
  });
});
