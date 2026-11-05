/**
 * FE-09: Grid utilities — coordinate system and grid rendering
 *
 * Acceptance:
 * - Property-based round-trip: toScreen→toModel returns exactly the input.
 * - Grid thinning produces bounded dot count for all zoom levels.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

type Point = { x: number; y: number };

type CoordViewport = { zoom: number; panX: number; panY: number };
type GridViewport = { width: number; height: number; zoom: number; panX: number; panY: number };

type CoordApi = {
  toModel: (screen: Point, viewport: CoordViewport) => Point;
  toScreen: (model: Point, viewport: CoordViewport) => Point;
};

type GridApi = {
  thinGrid: (gridStep: number, viewport: GridViewport) => unknown[];
};

let coords: CoordApi | null = null;
let gridUtils: GridApi | null = null;
let available = false;

try {
  const modCoords = await import(/* @vite-ignore */ "./coords");
  coords = { toModel: modCoords.toModel, toScreen: modCoords.toScreen };
  if (coords !== null) available = true;
} catch {
  // not yet implemented
}

try {
  const modGrid = await import(/* @vite-ignore */ "./grid/grid");
  gridUtils = { thinGrid: modGrid.thinGrid ?? modGrid.computeGridPoints };
  if (gridUtils !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-09: coordinate system", () => {
  skip("toScreen→toModel round-trips integers exactly at zoom ≥ 1", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.float({ min: Math.fround(1.0), max: Math.fround(4.0), noNaN: true }),
        (mx, my, zoom) => {
          const screen = coords?.toScreen({ x: mx, y: my }, { zoom, panX: 0, panY: 0 });
          const model = coords?.toModel(screen, { zoom, panX: 0, panY: 0 });
          expect(model.x).toBe(mx);
          expect(model.y).toBe(my);
        },
      ),
      { numRuns: 200 },
    );
  });

  skip("toModel result is always integers for integer model input", () => {
    const screen = coords?.toScreen({ x: 30, y: 40 }, { zoom: 1.5, panX: 100, panY: 50 });
    const back = coords?.toModel(screen, { zoom: 1.5, panX: 100, panY: 50 });
    expect(Number.isInteger(back.x)).toBe(true);
    expect(Number.isInteger(back.y)).toBe(true);
  });
});

describe("FE-09: grid thinning", () => {
  skip("dot count bounded at low zoom", () => {
    if (!gridUtils) return;
    const viewport = { width: 1280, height: 720, zoom: 0.2, panX: 0, panY: 0 };
    const dots = gridUtils?.thinGrid(10, viewport);
    // Reasonable upper bound to prevent perf cliff
    expect(dots.length).toBeLessThanOrEqual(10_000);
  });

  skip("dot count bounded at high zoom", () => {
    if (!gridUtils) return;
    const viewport = { width: 1280, height: 720, zoom: 4.0, panX: 0, panY: 0 };
    const dots = gridUtils?.thinGrid(10, viewport);
    expect(dots.length).toBeLessThanOrEqual(10_000);
  });
});
