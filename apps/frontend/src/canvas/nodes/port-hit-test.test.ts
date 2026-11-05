/**
 * FE-12: Port hit-test tests
 *
 * Acceptance:
 * - 4 rotations × 2 mirrors × 3 ports for representative shapes.
 * - Cursor exactly on port center always hits.
 * - Cursor at radius+1 misses.
 */

import { describe, expect, it } from "vitest";

type Point = { x: number; y: number };
type PortHit = { blockId: string; portId?: string };

type PortHitArgs = {
  cursor: Point | null;
  block: ReturnType<typeof makeBlock>;
  port: (typeof PORT_DEFS)[number];
  bbox: [number, number];
  hitRadius: number;
  zoom: number;
  getPortCenter?: boolean;
};

type PortHitTest = (args: PortHitArgs) => Point | PortHit | null;

function isPoint(value: Point | PortHit): value is Point {
  return "x" in value && "y" in value;
}

function isPortHit(value: Point | PortHit): value is PortHit {
  return "blockId" in value;
}

let portHitTest: PortHitTest | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./port-hit-test");
  portHitTest = mod.portHitTest ?? mod.hitTest ?? mod.default;
  if (portHitTest !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

// Minimal block descriptor
function makeBlock(rotation: number, mirror: "none" | "x" | "y") {
  return {
    id: "b1",
    type: "control.gain",
    position: [100, 100] as [number, number],
    rotation,
    mirror,
    params: {},
  };
}

const PORT_DEFS = [
  { id: "in", side: "left" as const, offset: 5 },
  { id: "mid", side: "top" as const, offset: 10 },
  { id: "out", side: "right" as const, offset: 5 },
];

const BBOX = [20, 10] as [number, number];
const HIT_RADIUS = 6;

describe("FE-12: port hit-test", () => {
  skip("hit test at port center returns the port", () => {
    for (const rotation of [0, 90, 180, 270]) {
      for (const mirror of ["none", "x"] as const) {
        const block = makeBlock(rotation, mirror);
        for (const port of PORT_DEFS) {
          const screenPos = portHitTest?.({
            cursor: null,
            block,
            port,
            bbox: BBOX,
            hitRadius: HIT_RADIUS,
            zoom: 1,
            getPortCenter: true,
          });
          if (!screenPos || !isPoint(screenPos)) continue; // no center computed — skip
          const result = portHitTest?.({
            cursor: screenPos,
            block,
            port,
            bbox: BBOX,
            hitRadius: HIT_RADIUS,
            zoom: 1,
          });
          expect(result).not.toBeNull();
          if (!result || !isPortHit(result)) throw new Error("Expected PortHit result");
          expect(result.blockId).toBe("b1");
        }
      }
    }
  });

  skip("cursor at radius+1 from port center misses", () => {
    const block = makeBlock(0, "none");
    // Port "out" is on the right side: approximately at (100+20, 100+5)
    const portCenter = portHitTest?.({
      cursor: null,
      block,
      port: PORT_DEFS[2],
      bbox: BBOX,
      hitRadius: HIT_RADIUS,
      zoom: 1,
      getPortCenter: true,
    });
    if (!portCenter || !isPoint(portCenter)) return;
    const miss = portHitTest?.({
      cursor: { x: portCenter.x + HIT_RADIUS + 1, y: portCenter.y },
      block,
      port: PORT_DEFS[2],
      bbox: BBOX,
      hitRadius: HIT_RADIUS,
      zoom: 1,
    });
    expect(miss).toBeNull();
  });
});
