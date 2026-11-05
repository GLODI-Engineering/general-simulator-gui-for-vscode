import { describe, expect, it } from "vitest";
import type { Block, BlockMetadata } from "../model/types";
import { getBlockBoundingBox } from "./geometry";
import { SYMBOL_SCALE } from "./nodes/port-hit-test";

function makeBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: "b1",
    type: "passive.resistor",
    paradigm: "signal-flow",
    domain: "electrical",
    fidelity: "ideal",
    position: [10, 20],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
    ...overrides,
  } as Block;
}

function makeMetadata(bbox: [number, number]): BlockMetadata {
  return { symbol: { bbox, shape: "rect" } } as unknown as BlockMetadata;
}

describe("FE-135: getBlockBoundingBox", () => {
  it("test_bounding_box_uses_position_and_bbox_unrotated: 0° rotation keeps bbox orientation", () => {
    const block = makeBlock({ position: [10, 20], rotation: 0 });
    const metadata = makeMetadata([20, 10]);
    const box = getBlockBoundingBox(block, metadata);
    expect(box).toEqual({ x: 10, y: 20, width: 20 * SYMBOL_SCALE, height: 10 * SYMBOL_SCALE });
  });

  it("test_bounding_box_accounts_for_rotation: 90°/270° swap width and height", () => {
    const metadata = makeMetadata([20, 10]);
    const box90 = getBlockBoundingBox(makeBlock({ rotation: 90 }), metadata);
    const box270 = getBlockBoundingBox(makeBlock({ rotation: 270 }), metadata);
    expect(box90.width).toBeCloseTo(10 * SYMBOL_SCALE);
    expect(box90.height).toBeCloseTo(20 * SYMBOL_SCALE);
    expect(box270.width).toBeCloseTo(10 * SYMBOL_SCALE);
    expect(box270.height).toBeCloseTo(20 * SYMBOL_SCALE);
  });

  it("test_bounding_box_falls_back_when_metadata_missing: default 96x48 used, no throw", () => {
    const box = getBlockBoundingBox(makeBlock(), null);
    expect(box.width).toBeCloseTo(96 * SYMBOL_SCALE);
    expect(box.height).toBeCloseTo(48 * SYMBOL_SCALE);
  });

  it("test_bounding_box_junction_is_1x1: routing.junction ignores metadata bbox", () => {
    const block = makeBlock({ type: "routing.junction" });
    const box = getBlockBoundingBox(block, makeMetadata([20, 10]));
    expect(box.width).toBeCloseTo(1 * SYMBOL_SCALE);
    expect(box.height).toBeCloseTo(1 * SYMBOL_SCALE);
  });
});
