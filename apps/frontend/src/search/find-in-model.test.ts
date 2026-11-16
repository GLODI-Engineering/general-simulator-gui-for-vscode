import { describe, expect, it } from "vitest";

import {
  BLOCK_ID_SCORE,
  BLOCK_LABEL_SCORE,
  BLOCK_TYPE_SCORE,
  MAX_RESULTS,
  NET_NAME_SCORE,
  PARAM_NAME_SCORE,
  type SearchableModel,
  WIRE_ID_SCORE,
  findInModel,
} from "./find-in-model";

function block(id: string, type: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type,
    paradigm: "signal",
    domain: "signal",
    fidelity: "ideal",
    position: [0, 0],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
    ...extra,
  } as unknown as SearchableModel["blocks"][number];
}

function wire(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    from: { block: "gain_1", port: "out" },
    to: { block: "pid_block", port: "in" },
    waypoints: [],
    pinned: false,
    net: null,
    kind: "signal",
    ...extra,
  } as unknown as SearchableModel["wires"][number];
}

const MODEL: SearchableModel = {
  blocks: [
    block("gain_1", "control.gain", { params: { k: 2 }, label: "Forward gain" }),
    block("pid_block", "control.pid", { params: { kp: 1, ki: 0.5 } }),
  ],
  wires: [wire("wire_kp_link", { net: "VOUT" })],
};

describe("find-in-model", () => {
  it("finds a block by id substring", () => {
    expect(findInModel(MODEL, "gain").some((m) => m.id === "gain_1")).toBe(true);
  });

  it("finds a block by type substring", () => {
    expect(findInModel(MODEL, "pid").some((m) => m.id === "pid_block")).toBe(true);
  });

  it("finds a block by parameter name", () => {
    const results = findInModel(MODEL, "kp");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({ id: "pid_block", kind: "param", detail: "kp" });
  });

  it("returns nothing for a blank query", () => {
    expect(findInModel(MODEL, "   ")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(findInModel(MODEL, "GAIN").some((m) => m.id === "gain_1")).toBe(true);
  });

  it("ranks a parameter name above a block id, and a block id above a wire id", () => {
    const model: SearchableModel = {
      blocks: [block("kp", "control.gain", { params: { kp: 1 } })],
      wires: [wire("kp_wire")],
    };
    const kinds = findInModel(model, "kp").map((m) => m.kind);
    expect(kinds.indexOf("param")).toBeLessThan(kinds.indexOf("block"));
    expect(kinds.indexOf("block")).toBeLessThan(kinds.indexOf("wire"));
    expect(PARAM_NAME_SCORE).toBeGreaterThan(BLOCK_ID_SCORE);
    expect(BLOCK_ID_SCORE).toBeGreaterThan(BLOCK_TYPE_SCORE);
    expect(BLOCK_TYPE_SCORE).toBeGreaterThan(WIRE_ID_SCORE);
  });

  it("finds a block by its label, which the schema-v2 model added", () => {
    const results = findInModel(MODEL, "Forward");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "gain_1", kind: "block", detail: "Forward gain" });
  });

  it("finds a wire by its net name and reveals that wire", () => {
    const results = findInModel(MODEL, "vout");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: "wire_kp_link", kind: "net", detail: "VOUT" });
    expect(NET_NAME_SCORE).toBeLessThan(BLOCK_LABEL_SCORE);
  });

  it("finds annotation text", () => {
    const results = findInModel(
      { ...MODEL, lines: [{ id: "note_1", kind: "text", text: "snubber here" }] as never },
      "snubber",
    );
    expect(results[0]).toMatchObject({ id: "note_1", kind: "annotation" });
  });

  it("lists a block once per matching parameter, not once per match with a duplicate key", () => {
    const model: SearchableModel = {
      blocks: [block("pid_block", "control.pid", { params: { k_p: 1, k_i: 2 } })],
      wires: [],
    };
    const results = findInModel(model, "k_");
    expect(results.map((m) => m.detail).sort()).toEqual(["k_i", "k_p"]);
    expect(new Set(results.map((m) => `${m.kind}:${m.id}:${m.detail}`)).size).toBe(results.length);
  });

  it("caps the result list", () => {
    const model: SearchableModel = {
      blocks: Array.from({ length: 200 }, (_, i) => block(`block_${i}`, "control.gain")),
      wires: [],
    };
    expect(findInModel(model, "block").length).toBe(MAX_RESULTS);
  });
});
