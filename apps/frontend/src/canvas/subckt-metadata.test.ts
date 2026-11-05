/**
 * SPICE .SUBCKT instance rendering: metadata synthesis + resolution.
 *
 * A `paradigm: "spice-subckt"` block has no catalog entry — its real, wireable
 * ports live on the referenced SubcktDef. These tests pin the port layout
 * (declaration order, split half-and-half left/right) and the three visual
 * states the resolver distinguishes.
 */

import { describe, expect, it } from "vitest";

import type { Block, BlockMetadata, SubcktDef } from "../model/types";
import {
  SUBCKT_INSTANCE_TYPE,
  type StructuredSubcktDef,
  hasStructuredContent,
  isSubcktInstance,
  resolveBlockMetadata,
  synthesizeSubcktMetadata,
} from "./subckt-metadata";

function makeDef(portIds: string[], extra: Partial<StructuredSubcktDef> = {}): StructuredSubcktDef {
  return {
    id: "opamp_def",
    name: "OPAMP",
    ports: portIds.map((id) => ({ id, kind: "physical-electrical" as const })),
    body: "",
    ...extra,
  };
}

function makeInstance(subckt_ref: string | undefined, id = "X1"): Block {
  return {
    id,
    type: SUBCKT_INSTANCE_TYPE,
    paradigm: "spice-subckt",
    domain: "physical-electrical",
    fidelity: "spice",
    position: [100, 100],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
    ...(subckt_ref ? { subckt_ref } : {}),
  };
}

const EMPTY_CATALOG: Record<string, BlockMetadata> = {};

describe("isSubcktInstance", () => {
  it("discriminates on paradigm, not type", () => {
    expect(isSubcktInstance({ paradigm: "spice-subckt", type: "spice-subckt.whatever" })).toBe(
      true,
    );
    expect(isSubcktInstance({ paradigm: "physical-network", type: SUBCKT_INSTANCE_TYPE })).toBe(
      true,
    );
    expect(isSubcktInstance({ paradigm: "physical-network", type: "physical-electrical.r" })).toBe(
      false,
    );
  });
});

describe("synthesizeSubcktMetadata port layout", () => {
  it("splits an odd port count ceil(n/2) left, remainder right, in declaration order", () => {
    const metadata = synthesizeSubcktMetadata(makeDef(["inp", "inn", "vcc", "vee", "out"]));
    expect(metadata.ports.inputs.map((p) => p.id)).toEqual(["inp", "inn", "vcc"]);
    expect(metadata.ports.outputs.map((p) => p.id)).toEqual(["vee", "out"]);
    expect(metadata.ports.inputs.every((p) => p.side === "left")).toBe(true);
    expect(metadata.ports.outputs.every((p) => p.side === "right")).toBe(true);
  });

  it("splits an even port count evenly", () => {
    const metadata = synthesizeSubcktMetadata(makeDef(["a", "b", "c", "d"]));
    expect(metadata.ports.inputs.map((p) => p.id)).toEqual(["a", "b"]);
    expect(metadata.ports.outputs.map((p) => p.id)).toEqual(["c", "d"]);
  });

  it("spaces ports with a half-step inset, strictly inside the body", () => {
    const metadata = synthesizeSubcktMetadata(makeDef(["a", "b", "c", "d"]));
    const height = metadata.symbol.bbox[1];
    const offsets = metadata.ports.inputs.map((p) => p.offset ?? -1);
    expect(offsets).toEqual([Math.round(height / 4), Math.round((3 * height) / 4)]);
    for (const offset of offsets) {
      expect(offset).toBeGreaterThan(0);
      expect(offset).toBeLessThan(height);
    }
  });

  it("grows the body with the busier side's port count", () => {
    const small = synthesizeSubcktMetadata(makeDef(["a", "b", "c"]));
    const big = synthesizeSubcktMetadata(makeDef(Array.from({ length: 11 }, (_, i) => `p${i}`)));
    expect(big.symbol.bbox[1]).toBeGreaterThan(small.symbol.bbox[1]);
    expect(small.symbol.bbox[1]).toBeGreaterThanOrEqual(48);
  });

  it("carries each pin's own kind and labels the box with the def name", () => {
    const def = makeDef(["a", "b"]);
    def.ports[1] = { id: "b", kind: "physical-thermal" };
    const metadata = synthesizeSubcktMetadata(def);
    expect(metadata.label).toBe("OPAMP");
    expect(metadata.ports.inputs[0]?.kind).toEqual({ domain: "physical-electrical" });
    expect(metadata.ports.outputs[0]?.kind).toEqual({ domain: "physical-thermal" });
  });

  it("returns a referentially stable object for an equal def (BlockNode memo)", () => {
    const a = synthesizeSubcktMetadata(makeDef(["a", "b"]));
    const b = synthesizeSubcktMetadata(makeDef(["a", "b"]));
    expect(a).toBe(b);
  });
});

describe("visual states", () => {
  const structured = makeDef(["a", "b"], {
    blocks: [
      {
        id: "R1",
        type: "physical-electrical.resistor",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: {},
        ic: {},
      },
    ],
    wires: [
      {
        id: "w1",
        from: { block: "R1", port: "p" },
        to: { block: "R1", port: "n" },
        waypoints: [
          [0, 0],
          [40, 0],
          [40, 40],
        ],
        pinned: false,
        net: null,
        kind: "physical-electrical",
      },
    ],
  });

  it("state 1: a def with structured content previews it under a translucent cover", () => {
    expect(hasStructuredContent(structured)).toBe(true);
    const metadata = synthesizeSubcktMetadata(structured, EMPTY_CATALOG);
    const primitives = metadata.symbol.primitives ?? [];
    // The previewed internals: a polyline for the wire, a rect for the block.
    expect(primitives.some((p) => p.type === "polyline")).toBe(true);
    // The cover: a filled rect with a translucent colour, drawn over them.
    const isCover = (p: (typeof primitives)[number]) =>
      p.type === "rectf" && String(p.color).startsWith("rgba(");
    const cover = primitives.find(isCover);
    expect(cover).toBeDefined();
    const coverIndex = primitives.findIndex(isCover);
    const polylineIndex = primitives.findIndex((p) => p.type === "polyline");
    expect(polylineIndex).toBeLessThan(coverIndex);
    // The name still reads on top of the cover.
    expect(primitives.some((p) => p.type === "text" && p.text === "OPAMP")).toBe(true);
  });

  it("state 2a: a def with no structured content is a plain 'subcircuit' + name box", () => {
    const metadata = synthesizeSubcktMetadata(makeDef(["a", "b"]));
    const texts = (metadata.symbol.primitives ?? [])
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text);
    expect(texts).toEqual(["subcircuit", "OPAMP"]);
    expect((metadata.symbol.primitives ?? []).some((p) => p.type === "rectf")).toBe(false);
  });

  it("state 2b: an unresolvable subckt_ref is a plain box captioned with the raw ref", () => {
    const metadata = resolveBlockMetadata(makeInstance("nope"), EMPTY_CATALOG, [makeDef(["a"])]);
    expect(metadata).not.toBeNull();
    const texts = (metadata?.symbol.primitives ?? [])
      .filter((p) => p.type === "text")
      .map((p) => (p as { text: string }).text);
    expect(texts).toEqual(["subcircuit", "nope"]);
    // No def means no known pin list — nothing to place.
    expect(metadata?.ports.inputs).toEqual([]);
    expect(metadata?.ports.outputs).toEqual([]);
  });

  it("state 3: a spice-subckt block with no subckt_ref at all resolves to null", () => {
    expect(resolveBlockMetadata(makeInstance(undefined), EMPTY_CATALOG, [])).toBeNull();
  });
});

describe("resolveBlockMetadata", () => {
  it("resolves a subckt instance's ports from the matching def", () => {
    const defs: SubcktDef[] = [makeDef(["inp", "inn", "out"]), { ...makeDef(["x"]), id: "other" }];
    const metadata = resolveBlockMetadata(makeInstance("opamp_def"), EMPTY_CATALOG, defs);
    expect(metadata?.label).toBe("OPAMP");
    expect(
      [...(metadata?.ports.inputs ?? []), ...(metadata?.ports.outputs ?? [])].map((p) => p.id),
    ).toEqual(["inp", "inn", "out"]);
  });

  it("never consults the catalog for a subckt instance", () => {
    const catalog = {
      [SUBCKT_INSTANCE_TYPE]: { label: "WRONG" } as unknown as BlockMetadata,
    };
    const metadata = resolveBlockMetadata(makeInstance("opamp_def"), catalog, [makeDef(["a"])]);
    expect(metadata?.label).toBe("OPAMP");
  });

  it("falls back to the catalog for ordinary blocks", () => {
    const resistor = { label: "Resistor" } as unknown as BlockMetadata;
    const block = { ...makeInstance("x"), paradigm: "physical-network" as const, type: "pe.r" };
    expect(resolveBlockMetadata(block, { "pe.r": resistor }, [])).toBe(resistor);
  });

  it("returns null for an unknown ordinary block type", () => {
    const block = { ...makeInstance("x"), paradigm: "physical-network" as const, type: "pe.zzz" };
    expect(resolveBlockMetadata(block, {}, [])).toBeNull();
  });
});
