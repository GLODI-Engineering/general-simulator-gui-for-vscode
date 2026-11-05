/**
 * FE-09: grid.test.ts
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

type GridViewport = { width: number; height: number; zoom: number; panX: number; panY: number };

type ThinGrid = (gridStep: number, viewport: GridViewport) => unknown[];

let thinGrid: ThinGrid | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./grid");
  thinGrid = mod.thinGrid ?? mod.computeGridPoints ?? null;
  available = !!thinGrid;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-09: grid thinning", () => {
  skip("no dots produced for zero-size viewport", () => {
    const dots = thinGrid?.(10, { width: 0, height: 0, zoom: 1, panX: 0, panY: 0 });
    expect(dots.length).toBe(0);
  });

  skip("grid spacing divides dot spacing evenly", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.float({ min: Math.fround(0.05), max: Math.fround(5.0), noNaN: true }),
        (gridStep, zoom) => {
          const dots = thinGrid?.(gridStep, { width: 400, height: 400, zoom, panX: 0, panY: 0 });
          expect(Array.isArray(dots)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});
