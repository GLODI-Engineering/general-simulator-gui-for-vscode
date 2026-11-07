import { describe, expect, it } from "vitest";
import { loadCatalogFromManifest } from "../../library/catalog";
import type { Block, BlockMetadata } from "../../model/types";
import { getMetadataPortCenters } from "./port-hit-test";
import {
  MIN_PORT_PITCH,
  resolveBlockBbox,
  resolveBlockPorts,
  variadicCount,
} from "./resolve-ports";

const CATALOG = loadCatalogFromManifest();

function metadataFor(name: string): BlockMetadata {
  const entry = CATALOG[name];
  if (!entry) {
    throw new Error(`no catalog entry for ${name}`);
  }
  return entry;
}

function blockFor(id: string, type: string, params: Block["params"]): Block {
  return {
    id,
    type,
    paradigm: "signal-flow",
    domain: "signal",
    fidelity: "ideal",
    position: [0, 0],
    rotation: 0,
    mirror: "none",
    params,
    ic: {},
  } as Block;
}

describe("variadicCount", () => {
  it("counts a string's characters, an array's entries, and an integer's value", () => {
    expect(variadicCount("+-")).toBe(2);
    expect(variadicCount("++-")).toBe(3);
    expect(variadicCount(["u", "v", "w"])).toBe(3);
    expect(variadicCount(4)).toBe(4);
  });

  it("is 0 for absent, empty and non-countable values", () => {
    expect(variadicCount(undefined)).toBe(0);
    expect(variadicCount("")).toBe(0);
    expect(variadicCount([])).toBe(0);
    expect(variadicCount(true)).toBe(0);
    expect(variadicCount(-3)).toBe(0);
  });
});

describe("resolveBlockPorts", () => {
  it("instantiates one control.sum input per `signs` entry", () => {
    const metadata = metadataFor("control.sum");
    // The static list really is empty — the whole point is that the ports come
    // from the param. Guard it so this test cannot silently pass for the wrong reason.
    expect(metadata.ports.inputs).toHaveLength(0);

    const two = resolveBlockPorts(metadata, { signs: "+-" });
    expect(two.inputs.map((p) => p.id)).toEqual(["in0", "in1"]);
    expect(two.outputs.map((p) => p.id)).toEqual(["out"]);

    const three = resolveBlockPorts(metadata, { signs: ["+", "+", "-"] });
    expect(three.inputs.map((p) => p.id)).toEqual(["in0", "in1", "in2"]);
  });

  it("spreads expanded inputs evenly down the bbox, as the hand-authored lists do", () => {
    const metadata = metadataFor("control.sum");
    const [, h] = metadata.symbol.bbox;
    const { inputs } = resolveBlockPorts(metadata, { signs: "+-" });
    expect(inputs.map((p) => p.offset)).toEqual([Math.round(h / 3), Math.round((2 * h) / 3)]);
    expect(inputs.every((p) => p.side === "left")).toBe(true);
  });

  it("expands a script block in both directions and labels ports from the name vectors", () => {
    const metadata = metadataFor("extensibility.pyblock");
    const resolved = resolveBlockPorts(metadata, {
      input_names: ["d_A", "d_B", "d_C", "U_dc"],
      output_names: ["i_A", "i_B", "i_C"],
    });
    expect(resolved.inputs.map((p) => p.id)).toEqual(["in0", "in1", "in2", "in3"]);
    expect(resolved.inputs.map((p) => p.label)).toEqual(["d_A", "d_B", "d_C", "U_dc"]);
    expect(resolved.outputs.map((p) => p.id)).toEqual(["out0", "out1", "out2"]);
    expect(resolved.outputs.map((p) => p.label)).toEqual(["i_A", "i_B", "i_C"]);
  });

  it("does not duplicate the static in0/out0 a script block also declares", () => {
    const metadata = metadataFor("extensibility.pyblock");
    expect(metadata.ports.inputs.map((p) => p.id)).toEqual(["in0"]);
    const resolved = resolveBlockPorts(metadata, { input_names: ["u"], output_names: ["y"] });
    expect(resolved.inputs.map((p) => p.id)).toEqual(["in0"]);
    expect(resolved.outputs.map((p) => p.id)).toEqual(["out0"]);
  });

  it("leaves a block with no variadic group exactly as declared", () => {
    const metadata = metadataFor("control.pid");
    const resolved = resolveBlockPorts(metadata, { kp: 1 });
    expect(resolved.inputs).toBe(metadata.ports.inputs);
    expect(resolved.outputs).toBe(metadata.ports.outputs);
  });

  it("falls back to the static list when the controlling param is missing", () => {
    const metadata = metadataFor("extensibility.pyblock");
    const resolved = resolveBlockPorts(metadata, {});
    expect(resolved.inputs.map((p) => p.id)).toEqual(["in0"]);
    expect(resolved.outputs.map((p) => p.id)).toEqual(["out0"]);
  });
});

describe("getMetadataPortCenters with param-driven ports", () => {
  it("gives a control.sum real, distinct input port centres", () => {
    const metadata = metadataFor("control.sum");
    const centers = getMetadataPortCenters(
      blockFor("s1", "control.sum", { signs: "+-" }),
      metadata,
    );
    const ids = centers.map((c) => c.id);
    expect(ids).toContain("in0");
    expect(ids).toContain("in1");
    expect(ids).toContain("out");
    const in0 = centers.find((c) => c.id === "in0");
    const in1 = centers.find((c) => c.id === "in1");
    expect(in0?.center.y).not.toBe(in1?.center.y);
    expect(in0?.center.x).toBe(in1?.center.x);
  });

  it("gives a 4-in/3-out pyblock seven port centres, not two", () => {
    const metadata = metadataFor("extensibility.pyblock");
    const block = blockFor("vsi", "extensibility.pyblock", {
      input_names: ["d_A", "d_B", "d_C", "U_dc"],
      output_names: ["i_A", "i_B", "i_C"],
    });
    expect(getMetadataPortCenters(block, metadata)).toHaveLength(7);
  });
});

describe("resolveBlockBbox", () => {
  it("returns the declared bbox identically for every block in the catalog at its defaults", () => {
    // The whole safety argument for growing a bbox is that it only ever fires for a
    // variadic block whose ports do not fit. At default params nothing in the catalog
    // should move — a changed bbox here means an existing symbol silently resized.
    const changed: string[] = [];
    for (const [name, metadata] of Object.entries(CATALOG)) {
      const defaults = Object.fromEntries(
        (metadata.params ?? []).map((p) => [p.name, p.default as never]),
      );
      if (resolveBlockBbox(metadata, defaults) !== metadata.symbol.bbox) {
        changed.push(name);
      }
    }
    expect(changed).toEqual([]);
  });

  it("grows a script block's height so four inputs clear MIN_PORT_PITCH", () => {
    const metadata = metadataFor("extensibility.pyblock");
    expect(metadata.symbol.bbox).toEqual([70, 40]);
    const grown = resolveBlockBbox(metadata, {
      input_names: ["d_A", "d_B", "d_C", "U_dc"],
      output_names: ["i_A", "i_B", "i_C"],
    });
    expect(grown[0]).toBe(70); // width untouched: no top/bottom ports
    expect(grown[1]).toBe(5 * MIN_PORT_PITCH);
    // …and the expanded ports are laid out against the grown height, not the declared one.
    const { inputs } = resolveBlockPorts(metadata, {
      input_names: ["d_A", "d_B", "d_C", "U_dc"],
      output_names: ["i_A", "i_B", "i_C"],
    });
    expect(inputs.map((p) => p.offset)).toEqual([12, 24, 36, 48]);
  });

  it("leaves a two-input control.sum alone — 40 units already clears the pitch", () => {
    const metadata = metadataFor("control.sum");
    expect(resolveBlockBbox(metadata, { signs: "+-" })).toBe(metadata.symbol.bbox);
  });
});
