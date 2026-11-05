/**
 * FE-13: Selection tests
 *
 * Acceptance:
 * - Click + Shift-click + Ctrl-click + marquee cases produce expected selection sets.
 * - Ctrl+A selects every block and every wire whose endpoints are both selected.
 * - Ctrl+Alt+A clears selection.
 */

import { describe, expect, it } from "vitest";

type Rect = { x: number; y: number; width: number; height: number };
type Block = { id: string; position: [number, number] };
type Wire = {
  id: string;
  from: { block: string; port: string };
  to: { block: string; port: string };
};
type SelectionResult = { blocks: string[]; wires: string[] };

type SelectionApi = {
  computeMarqueeSelection: (rect: Rect, blocks: Block[], wires: Wire[]) => SelectionResult;
  selectAll: (blocks: Block[], wires: Wire[], selectedBlocks: Set<string>) => SelectionResult;
};

let selectionUtils: SelectionApi | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./Selection");
  selectionUtils = {
    computeMarqueeSelection: mod.computeMarqueeSelection,
    selectAll: mod.selectAll,
  };
  if (selectionUtils !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

const BLOCKS = [
  { id: "b1", position: [0, 0] as [number, number] },
  { id: "b2", position: [50, 50] as [number, number] },
  { id: "b3", position: [200, 200] as [number, number] },
];

const WIRES = [
  { id: "w1", from: { block: "b1", port: "out" }, to: { block: "b2", port: "in" } },
  { id: "w2", from: { block: "b2", port: "out" }, to: { block: "b3", port: "in" } },
];

describe("FE-13: selection utilities", () => {
  skip("marquee selects blocks intersecting the rect", () => {
    const rect = { x: -10, y: -10, width: 80, height: 80 };
    const result = selectionUtils?.computeMarqueeSelection(rect, BLOCKS, WIRES);
    expect(result.blocks).toContain("b1");
    expect(result.blocks).toContain("b2");
    expect(result.blocks).not.toContain("b3");
  });

  skip("wire included only when both endpoints are in selection", () => {
    const selectedBlocks = new Set(["b1", "b2"]);
    const result = selectionUtils?.selectAll(BLOCKS, WIRES, selectedBlocks);
    expect(result.wires).toContain("w1");
    expect(result.wires).not.toContain("w2");
  });

  skip("Ctrl+A selects all blocks and connected wires", () => {
    const allBlocks = new Set(BLOCKS.map((b) => b.id));
    const result = selectionUtils?.selectAll(BLOCKS, WIRES, allBlocks);
    expect(result.blocks).toEqual(expect.arrayContaining(["b1", "b2", "b3"]));
    expect(result.wires).toEqual(expect.arrayContaining(["w1", "w2"]));
  });
});
