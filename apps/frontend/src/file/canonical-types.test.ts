import { describe, expect, it } from "vitest";

import type { Block, Model, ModelDocument } from "../model/types";
import { canonicalizeBlockTypes } from "./canonical-types";
import { deserialize } from "./deserializer";

/**
 * The bug these pin: the catalogue gives each component a canonical `name` and
 * a set of `aliases`, and the front end honours both — palette, symbol and
 * `supportsBlock` all resolve an alias happily. gsim-core's netlist emitter
 * resolves only the canonical name and raises `unknown-type` for anything
 * else. A document written with an alias therefore passed every check the app
 * could make and failed at compile, naming a type the user never typed.
 */

function block(id: string, type: string): Block {
  return {
    id,
    type,
    paradigm: "physical-network",
    domain: "physical-electrical",
    fidelity: "ideal",
    position: [0, 0],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
  };
}

function model(id: string, blocks: Block[]): Model {
  return {
    id,
    name: id,
    grid: 20,
    params: [],
    blocks,
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  };
}

const doc = (blocks: Block[]): ModelDocument => ({
  schema_version: 2,
  model: model("root", blocks),
});

describe("canonicalizeBlockTypes", () => {
  it("rewrites a taxonomy alias to the name the compiler accepts", () => {
    // The spelling the catalogue carries under `type`, and lists as an alias.
    const out = canonicalizeBlockTypes(doc([block("V1", "physical-electrical.source.voltage_dc")]));
    expect(out.model.blocks[0]?.type).toBe("source.voltage.dc");
  });

  it("rewrites the underscored legacy spelling too", () => {
    const out = canonicalizeBlockTypes(doc([block("R1", "physical_electrical.passive.resistor")]));
    expect(out.model.blocks[0]?.type).toBe("passive.resistor");
  });

  it("leaves a canonical name exactly as it is", () => {
    const input = doc([block("C1", "passive.capacitor")]);
    const out = canonicalizeBlockTypes(input);
    expect(out.model.blocks[0]?.type).toBe("passive.capacitor");
    // Nothing changed, so nothing was copied.
    expect(out).toBe(input);
  });

  it("leaves a type the engine has never heard of alone", () => {
    // Inventing a spelling for it would be worse than carrying it through: the
    // palette already says the simulator cannot compile it.
    const out = canonicalizeBlockTypes(doc([block("X1", "not.a.real.component")]));
    expect(out.model.blocks[0]?.type).toBe("not.a.real.component");
  });

  it("reaches blocks inside a subsystem body", () => {
    const inner = block("R1", "physical-electrical.passive.resistor");
    const group: Block = {
      ...block("sub", "hierarchy.subsystem.virtual"),
      subsystem: { ...model("sub-inner", [inner]), ports: [] },
    };
    const out = canonicalizeBlockTypes(doc([group]));
    const body = out.model.blocks[0]?.subsystem;
    expect(body?.blocks[0]?.type).toBe("passive.resistor");
  });

  it("reaches two levels down", () => {
    const deep = block("R1", "physical-electrical.passive.resistor");
    const inner: Block = {
      ...block("inner", "hierarchy.subsystem.virtual"),
      subsystem: { ...model("inner-body", [deep]), ports: [] },
    };
    const outer: Block = {
      ...block("outer", "hierarchy.subsystem.virtual"),
      subsystem: { ...model("outer-body", [inner]), ports: [] },
    };
    const out = canonicalizeBlockTypes(doc([outer]));
    const nested = out.model.blocks[0]?.subsystem?.blocks[0]?.subsystem?.blocks[0];
    expect(nested?.type).toBe("passive.resistor");
  });
});

describe("deserialize", () => {
  it("canonicalises on the way in, so no aliased type ever reaches the store", () => {
    const text = JSON.stringify(doc([block("V1", "physical-electrical.source.voltage_dc")]));
    expect(deserialize(text).model.blocks[0]?.type).toBe("source.voltage.dc");
  });
});
