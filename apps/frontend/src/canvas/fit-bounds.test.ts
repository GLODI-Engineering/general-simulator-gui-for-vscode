import { describe, expect, it } from "vitest";

import type { Block, BlockMetadata, Wire } from "../model/types";
import { FIT_PADDING, schematicBounds } from "./fit-bounds";
import { STUB_LEN, SYMBOL_SCALE } from "./nodes/port-hit-test";

const metadata = {
  name: "passive.resistor",
  symbol: { bbox: [60, 40], shape: "rect" },
  ports: { inputs: [], outputs: [] },
} as unknown as BlockMetadata;

function block(id: string, position: [number, number], rotation: 0 | 90 = 0): Block {
  return {
    id,
    type: "passive.resistor",
    paradigm: "physical-network",
    domain: "physical-electrical",
    fidelity: "ideal",
    position,
    rotation,
    mirror: "none",
    params: {},
    ic: {},
  } as Block;
}

function wire(id: string, waypoints: Array<[number, number]>): Wire {
  return {
    id,
    from: { block: "a", port: "n" },
    to: { block: "b", port: "p" },
    waypoints,
    pinned: false,
    net: null,
    kind: "physical-electrical",
  } as Wire;
}

const resolve = () => metadata;

describe("schematicBounds", () => {
  it("returns null for an empty sheet", () => {
    expect(schematicBounds([], [], resolve)).toBeNull();
  });

  it("covers a block's body plus its leads plus the frame padding", () => {
    const bounds = schematicBounds([block("a", [100, 100])], [], resolve);
    const bodyW = 60 * SYMBOL_SCALE;
    const bodyH = 40 * SYMBOL_SCALE;
    expect(bounds).toEqual({
      x: 100 - STUB_LEN - FIT_PADDING,
      y: 100 - STUB_LEN - FIT_PADDING,
      width: bodyW + 2 * STUB_LEN + 2 * FIT_PADDING,
      height: bodyH + 2 * STUB_LEN + 2 * FIT_PADDING,
    });
  });

  it("includes a wire that runs outside every node box", () => {
    // The regression this exists for: a return rail below the parts. Framing
    // by nodes alone cropped it, so a rendered converter lost its lower half.
    const blocks = [block("a", [100, 100])];
    const rail = wire("rail", [
      [100, 600],
      [900, 600],
    ]);
    const withRail = schematicBounds(blocks, [rail], resolve);
    const withoutRail = schematicBounds(blocks, [], resolve);

    expect(withRail).not.toBeNull();
    expect(withoutRail).not.toBeNull();
    const a = withRail as NonNullable<typeof withRail>;
    const b = withoutRail as NonNullable<typeof withoutRail>;

    expect(a.y + a.height).toBe(600 + FIT_PADDING);
    expect(a.x + a.width).toBe(900 + FIT_PADDING);
    expect(a.height).toBeGreaterThan(b.height);
    expect(a.width).toBeGreaterThan(b.width);
  });

  it("swaps width and height for a rotated block", () => {
    const bounds = schematicBounds([block("a", [0, 0], 90)], [], resolve);
    const b = bounds as NonNullable<typeof bounds>;
    expect(b.width).toBe(40 * SYMBOL_SCALE + 2 * STUB_LEN + 2 * FIT_PADDING);
    expect(b.height).toBe(60 * SYMBOL_SCALE + 2 * STUB_LEN + 2 * FIT_PADDING);
  });

  it("spans every block on the sheet", () => {
    const bounds = schematicBounds(
      [block("a", [0, 0]), block("b", [500, 300])],
      [],
      resolve,
    );
    const b = bounds as NonNullable<typeof bounds>;
    expect(b.x).toBe(-STUB_LEN - FIT_PADDING);
    expect(b.x + b.width).toBe(500 + 60 * SYMBOL_SCALE + STUB_LEN + FIT_PADDING);
  });
});
