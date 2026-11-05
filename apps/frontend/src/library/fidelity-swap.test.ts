/**
 * FE-62: fidelity-swap logic tests
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("./catalog-core", () => {
  const entries: Record<
    string,
    Record<
      string,
      { ports: { id: string; kind: string }[]; params: { id: string; default?: unknown }[] }
    >
  > = {
    "physical-electrical.passive.resistor": {
      ideal: {
        ports: [
          { id: "p", kind: "physical-electrical" },
          { id: "n", kind: "physical-electrical" },
        ],
        params: [{ id: "R", default: 1000 }],
      },
      behavioral: {
        ports: [
          { id: "p", kind: "physical-electrical" },
          { id: "n", kind: "physical-electrical" },
        ],
        params: [
          { id: "R", default: 1000 },
          { id: "alpha", default: 0.01 },
        ],
      },
    },
    "physical-electrical.semiconductor.mosfet_n": {
      ideal: {
        ports: [
          { id: "G", kind: "physical-electrical" },
          { id: "D", kind: "physical-electrical" },
          { id: "S", kind: "physical-electrical" },
        ],
        params: [],
      },
      spice: {
        ports: [
          { id: "G", kind: "physical-electrical" },
          { id: "D", kind: "physical-electrical" },
          { id: "S", kind: "physical-electrical" },
          { id: "B", kind: "physical-electrical" },
        ],
        params: [],
      },
    },
  };

  return {
    getCatalogEntryResult(type: string, fidelity: string) {
      const perType = entries[type];
      if (!perType) {
        return { entry: null, error: "unknown-block" };
      }
      const entry = perType[fidelity];
      if (!entry) {
        return { entry: null, error: "unknown-fidelity" };
      }
      return {
        tier: fidelity,
        ports: entry.ports.map((port) => ({
          ...port,
          direction: "inout",
        })),
        params: entry.params.map((param) => ({
          ...param,
          type: "number",
        })),
        doc: `${type}:${fidelity}`,
      };
    },
  };
});

import { canSwap, swap } from "./fidelity-swap";

describe("FE-62: fidelity-swap", () => {
  it("test_can_swap_ok: swap resistor ideal→behavioral (same ports p,n) returns ok=true", () => {
    const model = {
      blocks: [
        {
          id: "r1",
          type: "physical-electrical.passive.resistor",
          fidelity: "ideal",
          params: { R: 2200 },
        },
      ],
      wires: [],
    };

    const result = canSwap("r1", "behavioral", model);
    expect(result.ok).toBe(true);
  });

  it("test_can_swap_port_mismatch: mosfet_n.ideal (G,D,S) → mosfet_n.spice (G,D,S,B) returns ok=false with reason 'port-shape-mismatch' naming port B", () => {
    const model = {
      blocks: [
        {
          id: "m1",
          type: "physical-electrical.semiconductor.mosfet_n",
          fidelity: "ideal",
          params: {},
        },
      ],
      wires: [],
    };

    const result = canSwap("m1", "spice", model);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("port-shape-mismatch");
      expect(result.port).toBe("B");
    }
  });

  it("test_swap_param_delta_added: swap that adds a param seeds it with the catalogue default", () => {
    const model = {
      blocks: [
        {
          id: "r1",
          type: "physical-electrical.passive.resistor",
          fidelity: "ideal",
          params: { R: 3300 },
        },
      ],
      wires: [],
    };

    const result = swap("r1", "behavioral", model);
    expect(result.ok).toBe(true);
    expect(model.blocks[0].params).toEqual({ R: 3300, alpha: 0.01 });
  });

  it("test_swap_param_delta_removed: swap that drops a param removes it from block.params", () => {
    const model = {
      blocks: [
        {
          id: "r1",
          type: "physical-electrical.passive.resistor",
          fidelity: "behavioral",
          params: { R: 4700, alpha: 0.2 },
        },
      ],
      wires: [],
    };

    const result = swap("r1", "ideal", model);
    expect(result.ok).toBe(true);
    expect(model.blocks[0].params).toEqual({ R: 4700 });
  });

  it("test_swap_preserves_wires: wires to ports present in both tiers survive the swap", () => {
    const model = {
      blocks: [
        {
          id: "r1",
          type: "physical-electrical.passive.resistor",
          fidelity: "ideal",
          params: { R: 1000 },
        },
      ],
      wires: [
        { id: "w1", from: { block: "src", port: "out" }, to: { block: "r1", port: "p" } },
        { id: "w2", from: { block: "r1", port: "n" }, to: { block: "gnd", port: "in" } },
      ],
    };

    const result = swap("r1", "behavioral", model);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.removedWires).toEqual([]);
    }
    expect(model.wires.map((wire) => wire.id)).toEqual(["w1", "w2"]);
  });
});
