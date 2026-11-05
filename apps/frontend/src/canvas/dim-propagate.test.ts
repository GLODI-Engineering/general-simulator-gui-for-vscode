import { describe, expect, it } from "vitest";
import { type PropagateModel, propagate } from "./dim-propagate";

function expectDimMap(result: ReturnType<typeof propagate>): Map<string, number[]> {
  expect(result instanceof Map).toBe(true);
  if (!(result instanceof Map)) throw new Error(`Expected Map result, got ${result.error}`);
  return result;
}

describe("FE-65: dim-propagate", () => {
  it("test_propagate_scalar: a constant=1 → gain → scope chain produces dim [1] on every wire", () => {
    const model: PropagateModel = {
      blocks: [
        { id: "c1", type: "signal-flow.source.constant", params: { value: 1 } },
        { id: "g1", type: "signal-flow.math.gain", params: { k: 2 } },
        { id: "s1", type: "signal-flow.sink.scope" },
      ],
      wires: [
        { id: "w1", from: { block: "c1", port: "out" }, to: { block: "g1", port: "in" } },
        { id: "w2", from: { block: "g1", port: "out" }, to: { block: "s1", port: "in" } },
      ],
    };

    const dims = expectDimMap(propagate(model));
    expect(dims.get("w1")).toEqual([1]);
    expect(dims.get("w2")).toEqual([1]);
  });

  it("test_propagate_vector: a constant=[1,2,3] → gain → scope chain produces dim [3]", () => {
    const model: PropagateModel = {
      blocks: [
        { id: "c1", type: "signal-flow.source.constant", params: { value: [1, 2, 3] } },
        { id: "g1", type: "signal-flow.math.gain", params: { k: 2 } },
        { id: "s1", type: "signal-flow.sink.scope" },
      ],
      wires: [
        { id: "w1", from: { block: "c1", port: "out" }, to: { block: "g1", port: "in" } },
        { id: "w2", from: { block: "g1", port: "out" }, to: { block: "s1", port: "in" } },
      ],
    };

    const dims = expectDimMap(propagate(model));
    expect(dims.get("w1")).toEqual([3]);
    expect(dims.get("w2")).toEqual([3]);
  });

  it("test_propagate_mux: a 2-input mux fed by dim [3] and dim [2] sources produces dim [5] on its output wire", () => {
    const model: PropagateModel = {
      blocks: [
        { id: "c1", type: "signal-flow.source.constant", params: { value: [1, 2, 3] } },
        { id: "c2", type: "signal-flow.source.constant", params: { value: [4, 5] } },
        { id: "mux", type: "routing.mux", params: { n_inputs: 2 } },
        { id: "s1", type: "signal-flow.sink.scope" },
      ],
      wires: [
        { id: "w1", from: { block: "c1", port: "out" }, to: { block: "mux", port: "in0" } },
        { id: "w2", from: { block: "c2", port: "out" }, to: { block: "mux", port: "in1" } },
        { id: "w3", from: { block: "mux", port: "out" }, to: { block: "s1", port: "in" } },
      ],
    };

    const dims = expectDimMap(propagate(model));
    expect(dims.get("w1")).toEqual([3]);
    expect(dims.get("w2")).toEqual([2]);
    expect(dims.get("w3")).toEqual([5]);
  });

  it("test_propagate_demux: a demux with outputs=[2,3] fed dim [5] produces dim [2] and dim [3]", () => {
    const model: PropagateModel = {
      blocks: [
        { id: "c1", type: "signal-flow.source.constant", params: { value: [10, 20, 30, 40, 50] } },
        { id: "demux", type: "routing.demux", params: { outputs: [2, 3] } },
        { id: "s1", type: "signal-flow.sink.scope" },
        { id: "s2", type: "signal-flow.sink.scope" },
      ],
      wires: [
        { id: "w-in", from: { block: "c1", port: "out" }, to: { block: "demux", port: "in" } },
        { id: "w-out0", from: { block: "demux", port: "out0" }, to: { block: "s1", port: "in" } },
        { id: "w-out1", from: { block: "demux", port: "out1" }, to: { block: "s2", port: "in" } },
      ],
    };

    const dims = expectDimMap(propagate(model));
    expect(dims.get("w-in")).toEqual([5]);
    expect(dims.get("w-out0")).toEqual([2]);
    expect(dims.get("w-out1")).toEqual([3]);
  });

  it("test_propagate_signal_specification_pins: signal_specification dim=[4] pins downstream inherit chain to [4]", () => {
    const model: PropagateModel = {
      blocks: [
        { id: "c1", type: "signal-flow.source.constant", params: { value: [1, 2, 3] } },
        {
          id: "spec",
          type: "signal-flow.attributes.signal_specification",
          params: { dim: [4] },
        },
        { id: "g1", type: "signal-flow.math.gain", params: { k: 2 } },
        { id: "s1", type: "signal-flow.sink.scope" },
      ],
      wires: [
        { id: "w1", from: { block: "c1", port: "out" }, to: { block: "spec", port: "in" } },
        { id: "w2", from: { block: "spec", port: "out" }, to: { block: "g1", port: "in" } },
        { id: "w3", from: { block: "g1", port: "out" }, to: { block: "s1", port: "in" } },
      ],
    };

    const dims = expectDimMap(propagate(model));
    expect(dims.get("w2")).toEqual([4]);
    expect(dims.get("w3")).toEqual([4]);
  });

  it("test_dim_loop_detection: an inherit cycle raises DimLoopError naming all blocks in the cycle", () => {
    const model: PropagateModel = {
      blocks: [
        { id: "g1", type: "signal-flow.math.gain", params: { k: 1 } },
        { id: "g2", type: "signal-flow.math.gain", params: { k: 1 } },
      ],
      wires: [
        { id: "w1", from: { block: "g1", port: "out" }, to: { block: "g2", port: "in" } },
        { id: "w2", from: { block: "g2", port: "out" }, to: { block: "g1", port: "in" } },
      ],
    };

    const result = propagate(model);
    expect(result instanceof Map).toBe(false);
    if (result instanceof Map) return;

    expect(result.error).toBe("dim-loop");
    const cycleText = result.cycle.join(" ");
    expect(cycleText).toContain("g1");
    expect(cycleText).toContain("g2");
  });
});
