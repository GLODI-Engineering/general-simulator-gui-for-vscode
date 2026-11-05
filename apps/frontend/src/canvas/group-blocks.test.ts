import { describe, expect, it } from "vitest";

import type { Block, BlockMetadata, Model, Wire } from "../model/types";
import { groupBlocksIntoSubsystem } from "./group-blocks";

function block(id: string, position: [number, number] = [0, 0]): Block {
  return {
    id,
    type: "physical-electrical.resistor",
    paradigm: "physical-network",
    domain: "physical-electrical",
    fidelity: "ideal",
    position,
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
  };
}

function wire(id: string, from: [string, string], to: [string, string]): Wire {
  return {
    id,
    from: { block: from[0], port: from[1] },
    to: { block: to[0], port: to[1] },
    waypoints: [],
    pinned: false,
    net: null,
    kind: "physical-electrical",
  };
}

function model(blocks: Block[], wires: Wire[]): Model {
  return {
    id: "m",
    name: "m",
    grid: 10,
    params: [],
    blocks,
    wires,
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
  };
}

function portMeta(name: string, dir: "in" | "out"): BlockMetadata {
  const port = { id: dir === "in" ? "out" : "in", label: "", kind: { domain: "signal" } };
  return {
    name,
    label: name,
    version: 1,
    category: "subsystems",
    description: "",
    paradigm: "hierarchy",
    domain: "signal",
    fidelities: [],
    ports: dir === "in" ? { inputs: [], outputs: [port] } : { inputs: [port], outputs: [] },
    params: [
      { name: "id", label: "Port id", type: "string", default: dir === "in" ? "in1" : "out1" },
      { name: "kind", label: "Kind", type: "string", default: "signal" },
    ],
    symbol: { bbox: [60, 40], shape: "rect" },
    behavior: { causality: dir === "in" ? "source" : "sink", domain: "signal", state_count: 0 },
  } as unknown as BlockMetadata;
}

const catalog: Record<string, BlockMetadata> = {
  "hierarchy.inport": portMeta("hierarchy.inport", "in"),
  "hierarchy.outport": portMeta("hierarchy.outport", "out"),
};

describe("groupBlocksIntoSubsystem", () => {
  it("returns null when fewer than two blocks are grouped", () => {
    const m = model([block("a"), block("b")], []);
    expect(groupBlocksIntoSubsystem(m, ["a"], catalog)).toBeNull();
  });

  it("moves fully-internal wires into the subsystem with no boundary ports", () => {
    const m = model([block("a"), block("b")], [wire("w1", ["a", "p"], ["b", "n"])]);
    const result = groupBlocksIntoSubsystem(m, ["a", "b"], catalog);
    expect(result).not.toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: asserted above
    const r = result!;
    expect(r.blocks).toHaveLength(1);
    const sub = r.blocks[0]?.subsystem;
    expect(sub?.ports ?? []).toHaveLength(0);
    expect(sub?.blocks).toHaveLength(2);
    expect(sub?.wires).toHaveLength(1);
    expect(r.wires).toHaveLength(0);
  });

  it("synthesizes inport/outport boundary ports for boundary-crossing wires", () => {
    const m = model(
      [block("a", [100, 100]), block("b", [200, 100]), block("c", [400, 100])],
      [
        wire("w1", ["a", "out"], ["b", "in"]), // internal
        wire("w2", ["c", "out"], ["a", "in"]), // external → group (inport)
        wire("w3", ["b", "out"], ["c", "in"]), // group → external (outport)
      ],
    );
    const result = groupBlocksIntoSubsystem(m, ["a", "b"], catalog);
    expect(result).not.toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: asserted above
    const r = result!;

    // No connection lost: c stays plus the subsystem block.
    expect(r.blocks.map((blk) => blk.id)).toContain("c");
    const subBlock = r.blocks.find((blk) => blk.type === "hierarchy.subsystem.virtual");
    expect(subBlock).toBeDefined();
    const sub = subBlock?.subsystem;

    // Two boundary blocks added inside (inport + outport) → 4 inner blocks.
    expect(sub?.blocks).toHaveLength(4);
    expect(sub?.blocks.filter((blk) => blk.type === "hierarchy.inport")).toHaveLength(1);
    expect(sub?.blocks.filter((blk) => blk.type === "hierarchy.outport")).toHaveLength(1);

    // subsystem.ports reflects one in + one out port.
    const ports = sub?.ports ?? [];
    expect(ports.filter((p) => p.direction === "in")).toHaveLength(1);
    expect(ports.filter((p) => p.direction === "out")).toHaveLength(1);
    expect(ports.every((p) => p.kind === "physical-electrical")).toBe(true);

    // Inner wires: original internal + inport→a + b→outport = 3.
    expect(sub?.wires).toHaveLength(3);

    // External wires rewired to the subsystem block's boundary ports.
    expect(r.wires).toHaveLength(2);
    const inPort = ports.find((p) => p.direction === "in");
    const outPort = ports.find((p) => p.direction === "out");
    const intoSub = r.wires.find((w) => w.from.block === "c");
    const outOfSub = r.wires.find((w) => w.to.block === "c");
    expect(intoSub?.to).toEqual({ block: subBlock?.id, port: inPort?.id });
    expect(outOfSub?.from).toEqual({ block: subBlock?.id, port: outPort?.id });
  });

  it("shares a single boundary port when one inner port fans out to multiple externals", () => {
    const m = model(
      [block("a"), block("b"), block("c"), block("d")],
      [
        wire("w1", ["a", "out"], ["b", "in"]), // internal
        wire("w2", ["b", "out"], ["c", "in"]), // group b.out → external c
        wire("w3", ["b", "out"], ["d", "in"]), // group b.out → external d (same inner port)
      ],
    );
    const result = groupBlocksIntoSubsystem(m, ["a", "b"], catalog);
    // biome-ignore lint/style/noNonNullAssertion: asserted by the scenario
    const r = result!;
    const sub = r.blocks.find((blk) => blk.type === "hierarchy.subsystem.virtual")?.subsystem;
    // Only one outport synthesized despite two external wires.
    expect(sub?.blocks.filter((blk) => blk.type === "hierarchy.outport")).toHaveLength(1);
    expect((sub?.ports ?? []).filter((p) => p.direction === "out")).toHaveLength(1);
    // Both external wires rewired to the same port.
    expect(r.wires).toHaveLength(2);
    const targets = new Set(r.wires.map((w) => w.from.port));
    expect(targets.size).toBe(1);
  });

  it("returns null when boundary wires exist but the port catalog is missing", () => {
    const m = model([block("a"), block("b"), block("c")], [wire("w2", ["c", "out"], ["a", "in"])]);
    expect(groupBlocksIntoSubsystem(m, ["a", "b"], {})).toBeNull();
  });
});
