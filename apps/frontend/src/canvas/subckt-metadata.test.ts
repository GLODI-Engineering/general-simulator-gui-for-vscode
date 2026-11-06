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

  /**
   * The case that was actually broken. `previewPrimitives` collected only
   * `wire.waypoints`, and a straight port-to-port wire carries an empty array —
   * which is most wires in a real def. Every one of them contributed nothing,
   * so the preview was a scatter of unconnected grey boxes. The existing test
   * above never caught it because its single fixture wire happens to have
   * waypoints.
   */
  const straightWired = makeDef(["a", "b"], {
    blocks: [
      {
        id: "sub",
        type: "spice-subckt.boundary",
        paradigm: "spice-subckt",
        domain: "mixed",
        fidelity: "ideal",
        position: [0, 0],
        rotation: 0,
        mirror: "none",
        params: {},
        ic: {},
      },
      {
        id: "R1",
        type: "physical-electrical.resistor",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [120, 0],
        rotation: 0,
        mirror: "none",
        params: {},
        ic: {},
      },
      {
        id: "R2",
        type: "physical-electrical.resistor",
        paradigm: "physical-network",
        domain: "physical-electrical",
        fidelity: "ideal",
        position: [240, 0],
        rotation: 0,
        mirror: "none",
        params: {},
        ic: {},
      },
    ],
    wires: [
      {
        id: "w1",
        from: { block: "R1", port: "p2" },
        to: { block: "R2", port: "p1" },
        waypoints: [],
        pinned: false,
        net: null,
        kind: "physical-electrical",
      },
      {
        id: "w2",
        from: { block: "sub", port: "a" },
        to: { block: "R1", port: "p1" },
        waypoints: [],
        pinned: false,
        net: null,
        kind: "physical-electrical",
      },
    ],
  });

  it("draws a wire that has no waypoints at all", () => {
    const metadata = synthesizeSubcktMetadata(straightWired, EMPTY_CATALOG);
    // Preview wires carry the preview ink colour; the body outline is also a
    // polyline but is drawn uncoloured, so it is not one of these.
    const polylines = (metadata.symbol.primitives ?? []).filter(
      (p) => p.type === "polyline" && "color" in p && p.color !== undefined,
    );
    // One per wire. Previously: zero, because neither wire had a waypoint.
    expect(polylines).toHaveLength(2);
    for (const line of polylines) {
      const pts = (line as { pts: Array<[number, number]> }).pts;
      expect(pts.length).toBeGreaterThanOrEqual(2);
      // A real path, not a zero-length stub collapsed onto one point.
      expect(pts[0]).not.toEqual(pts[pts.length - 1]);
    }
  });

  it("does not draw the boundary pseudo-block as a component", () => {
    const metadata = synthesizeSubcktMetadata(straightWired, EMPTY_CATALOG);
    const rects = (metadata.symbol.primitives ?? []).filter((p) => p.type === "rect");
    // R1 and R2 only — the boundary is the def's own edge, not a part in it.
    expect(rects).toHaveLength(2);
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

/**
 * A real def mixes paradigms: `sw_leg` is `(d, s, ctrl_freq, ctrl_phase,
 * ctrl_duty)` — two power terminals and three control inputs. The old
 * half-and-half-by-declaration-order split put `d, s, ctrl_freq` on the left
 * face and `ctrl_phase, ctrl_duty` on the right, interleaving power and
 * control on both sides, so every control wire had to loop around the power
 * path to reach the block.
 */
describe("a mixed-paradigm boundary is split by paradigm, not by declaration order", () => {
  const mixed: StructuredSubcktDef = {
    id: "sw_leg",
    name: "sw_leg",
    ports: [
      { id: "d", kind: "physical-electrical" },
      { id: "s", kind: "physical-electrical" },
      { id: "ctrl_freq", kind: "signal" },
      { id: "ctrl_phase", kind: "signal" },
      { id: "ctrl_duty", kind: "signal" },
    ],
    body: "",
  };

  const sideOf = (portId: string) => {
    const m = synthesizeSubcktMetadata(mixed);
    const all = [...m.ports.inputs, ...m.ports.outputs];
    return all.find((p) => p.id === portId)?.side;
  };

  it("keeps power on the left and right faces", () => {
    expect(sideOf("d")).toBe("left");
    expect(sideOf("s")).toBe("right");
  });

  it("puts every control port on the bottom face", () => {
    for (const id of ["ctrl_freq", "ctrl_phase", "ctrl_duty"]) {
      expect(sideOf(id), id).toBe("bottom");
    }
  });

  it("loses no port in the split", () => {
    const m = synthesizeSubcktMetadata(mixed);
    const ids = [...m.ports.inputs, ...m.ports.outputs].map((p) => p.id).sort();
    expect(ids).toEqual(["ctrl_duty", "ctrl_freq", "ctrl_phase", "d", "s"]);
  });

  it("widens the body so the bottom ports are not crowded", () => {
    const m = synthesizeSubcktMetadata(mixed);
    const [w] = m.symbol.bbox;
    const offsets = [...m.ports.inputs, ...m.ports.outputs]
      .filter((p) => p.side === "bottom")
      .map((p) => p.offset ?? 0)
      .sort((a, b) => a - b);
    expect(offsets[0]).toBeGreaterThan(0);
    expect(offsets[offsets.length - 1]).toBeLessThan(w);
    // Real separation between neighbours, not three ports stacked at the middle.
    expect(offsets[1] - offsets[0]).toBeGreaterThanOrEqual(20);
  });
});
