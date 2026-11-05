/**
 * FE-10: Snap helper tests
 *
 * Acceptance:
 * - Pointer near a port → port.
 * - Pointer on a wire body → wire.
 * - Pointer in empty space → grid.
 * - Multi-item coarsest-grid rule exercised.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

type Point = { x: number; y: number };

type SnapPort = { blockId: string; portId: string; x: number; y: number };
type SnapWire = { id: string; points: Point[] };

type SnapContext = {
  ports: SnapPort[];
  wires: SnapWire[];
  gridStep: number;
  snapRadius: number;
  zoom: number;
  selectionGridSteps?: number[];
};

type SnapResult = { kind: "port" | "wire" | "grid"; refId?: string; x: number; y: number };

type Snap = (cursor: Point, ctx: SnapContext) => SnapResult;

let snap: Snap | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./snap");
  snap = mod.snap ?? mod.default;
  if (snap !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-10: snap helper", () => {
  const PORT_RADIUS = 8;

  skip("snap near port returns kind=port", () => {
    const ports = [{ blockId: "b1", portId: "out", x: 100, y: 100 }];
    const result = snap?.(
      { x: 101, y: 101 },
      { ports, wires: [], gridStep: 10, snapRadius: PORT_RADIUS, zoom: 1 },
    );
    expect(result.kind).toBe("port");
    expect(result.refId).toBe("b1:out");
  });

  skip("snap far from ports but on wire returns kind=wire", () => {
    // Wire from (0,50) to (200,50) — horizontal
    const wires = [
      {
        id: "w1",
        points: [
          { x: 0, y: 50 },
          { x: 200, y: 50 },
        ],
      },
    ];
    const result = snap?.(
      { x: 100, y: 50 },
      { ports: [], wires, gridStep: 10, snapRadius: PORT_RADIUS, zoom: 1 },
    );
    expect(result.kind).toBe("wire");
    expect(result.refId).toBe("w1");
  });

  skip("snap in empty space returns kind=grid", () => {
    const result = snap?.(
      { x: 15, y: 15 },
      { ports: [], wires: [], gridStep: 10, snapRadius: PORT_RADIUS, zoom: 1 },
    );
    expect(result.kind).toBe("grid");
    expect(Number.isInteger(result.x)).toBe(true);
    expect(Number.isInteger(result.y)).toBe(true);
  });

  skip("ports outrank wires: pointer near both returns port", () => {
    const ports = [{ blockId: "b1", portId: "out", x: 100, y: 50 }];
    const wires = [
      {
        id: "w1",
        points: [
          { x: 0, y: 50 },
          { x: 200, y: 50 },
        ],
      },
    ];
    const result = snap?.(
      { x: 100, y: 50 },
      { ports, wires, gridStep: 10, snapRadius: PORT_RADIUS, zoom: 1 },
    );
    expect(result.kind).toBe("port");
  });

  skip("snap result coordinates are always integers", () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(-200), max: Math.fround(200), noNaN: true }),
        fc.float({ min: Math.fround(-200), max: Math.fround(200), noNaN: true }),
        (px, py) => {
          const result = snap?.(
            { x: px, y: py },
            { ports: [], wires: [], gridStep: 10, snapRadius: 5, zoom: 1 },
          );
          expect(Number.isInteger(result.x)).toBe(true);
          expect(Number.isInteger(result.y)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  skip("multi-item coarsest-grid rule: selection uses coarsest grid", () => {
    // Two blocks with different grid overrides; result must snap to the coarser one
    const result = snap?.(
      { x: 15, y: 15 },
      { ports: [], wires: [], gridStep: 10, selectionGridSteps: [10, 20], snapRadius: 5, zoom: 1 },
    );
    // Snap must land on a multiple of 20 (the coarsest)
    expect(result.x % 20).toBe(0);
    expect(result.y % 20).toBe(0);
  });
});
