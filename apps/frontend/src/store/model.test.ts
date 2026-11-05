import { describe, expect, it } from "vitest";
import type { Block, Model, ModelDocument } from "../model/types";
import { collectAllBlockIds, ensureUniqueBlockIds, syncSubsystemPorts } from "./model";

function makeModel(id: string, blocks: Block[] = []): Model {
  return {
    id,
    name: id,
    grid: 10,
    params: [],
    blocks,
    wires: [],
    lines: [],
    nets: [],
    simulation: {},
  };
}

function makeSubsystemBlock(id: string, innerBlocks: Block[]): Block {
  return {
    id,
    type: "hierarchy.subsystem.atomic",
    paradigm: "hierarchy",
    domain: "signal",
    fidelity: "n_a",
    position: [0, 0],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
    subsystem: {
      ...makeModel(`${id}-inner`, innerBlocks),
      ports: [],
    },
  };
}

describe("FE-58: subsystem model utilities", () => {
  it("test_subsystem_port_sync: hierarchy.inport produces matching subsystem.ports entry", () => {
    const inport: Block = {
      id: "in-a",
      type: "hierarchy.inport",
      paradigm: "hierarchy",
      domain: "signal",
      fidelity: "n_a",
      position: [0, 0],
      rotation: 0,
      mirror: "none",
      params: { id: "vin", kind: "physical-electrical" },
      ic: {},
    };

    const subsystem = makeSubsystemBlock("sub-a", [inport]);
    const document: ModelDocument = {
      schema_version: 2,
      model: makeModel("root", [subsystem]),
    };

    const synced = syncSubsystemPorts(document, [], "sub-a");
    const syncedSubsystem = synced.model.blocks.find((b) => b.id === "sub-a")?.subsystem;

    expect(syncedSubsystem?.ports).toEqual([
      {
        id: "vin",
        direction: "in",
        kind: "physical-electrical",
        boundary_block: "in-a",
      },
    ]);
  });

  it("test_subsystem_id_uniqueness: cloning subsystem renames inner block ids globally", () => {
    const innerA: Block = {
      id: "inner",
      type: "signal.step",
      paradigm: "signal-flow",
      domain: "signal",
      fidelity: "ideal",
      position: [0, 0],
      rotation: 0,
      mirror: "none",
      params: {},
      ic: {},
    };

    const innerB: Block = {
      ...innerA,
      position: [20, 0],
    };

    const model = makeModel("root", [
      makeSubsystemBlock("subsys", [innerA]),
      makeSubsystemBlock("subsys", [innerB]),
    ]);

    const uniqueModel = ensureUniqueBlockIds(model);
    const ids = [...collectAllBlockIds(uniqueModel)];

    expect(ids.length).toBe(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toContain("subsys");
    expect(ids).toContain("subsys_2");
    expect(ids).toContain("inner");
    expect(ids).toContain("inner_2");
  });
});
