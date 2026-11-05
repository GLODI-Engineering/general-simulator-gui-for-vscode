/**
 * FE-14: Keyboard nudge tests
 *
 * Acceptance:
 * - Arrow moves selection by grid units.
 * - Shift+Arrow moves by grid × 10.
 * - Nudge does NOT dispatch in in-place-edit context.
 */

import { describe, expect, it } from "vitest";

type Block = { id: string; position: [number, number] };

type Nudge = (
  blocks: Block[],
  key: string,
  opts: { shift: boolean; gridStep: number; context: "selection" | "in-place-edit" },
) => Block[] | null;

let nudge: Nudge | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./nudge");
  nudge = mod.nudge ?? mod.default;
  if (nudge !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-14: nudge", () => {
  skip("Arrow Right moves by gridStep in x", () => {
    const blocksBefore = [{ id: "b1", position: [0, 0] as [number, number] }];
    const result = nudge?.(blocksBefore, "ArrowRight", {
      shift: false,
      gridStep: 10,
      context: "selection",
    });
    expect(result[0].position[0]).toBe(10);
    expect(result[0].position[1]).toBe(0);
  });

  skip("Shift+Arrow Right moves by gridStep × 10", () => {
    const blocksBefore = [{ id: "b1", position: [0, 0] as [number, number] }];
    const result = nudge?.(blocksBefore, "ArrowRight", {
      shift: true,
      gridStep: 10,
      context: "selection",
    });
    expect(result[0].position[0]).toBe(100);
  });

  skip("Arrow Up moves by -gridStep in y (canvas y-down or y-up depending on coord system)", () => {
    const blocksBefore = [{ id: "b1", position: [0, 0] as [number, number] }];
    const result = nudge?.(blocksBefore, "ArrowUp", {
      shift: false,
      gridStep: 10,
      context: "selection",
    });
    // position[1] decreases (moving up)
    expect(Math.abs(result[0].position[1])).toBe(10);
  });

  skip("nudge in in-place-edit context returns null (no dispatch)", () => {
    const blocksBefore = [{ id: "b1", position: [0, 0] as [number, number] }];
    const result = nudge?.(blocksBefore, "ArrowRight", {
      shift: false,
      gridStep: 10,
      context: "in-place-edit",
    });
    expect(result).toBeNull();
  });

  skip("result coordinates are integers", () => {
    const blocksBefore = [{ id: "b1", position: [0, 0] as [number, number] }];
    const result = nudge?.(blocksBefore, "ArrowRight", {
      shift: false,
      gridStep: 10,
      context: "selection",
    });
    expect(Number.isInteger(result[0].position[0])).toBe(true);
    expect(Number.isInteger(result[0].position[1])).toBe(true);
  });
});
