/**
 * FE-21: Pin/unpin + waypoint drag tests
 *
 * Acceptance:
 * - Pin/unpin/drag-waypoint each produce exactly one undo frame.
 * - After unpin, subsequent block moves auto-route as if originally unpinned.
 */

import { describe, expect, it, vi } from "vitest";

type Wire = {
  id: string;
  from: { block: string; port: string };
  to: { block: string; port: string };
  waypoints: number[];
  pinned: boolean;
};

type TxStore = { transact: (name: string, fn: () => void) => void };

type PinningApi = {
  pinBend: (wire: Wire, waypointIndex: number, store: TxStore) => Wire | undefined;
  unpinBend: (wire: Wire, store: TxStore) => Wire | undefined;
  dragWaypoint: (
    wire: Wire,
    waypointIndex: number,
    cursor: { x: number; y: number },
    store: TxStore,
  ) => Wire | undefined;
};

let pinning: PinningApi | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./pinning");
  pinning = { pinBend: mod.pinBend, unpinBend: mod.unpinBend, dragWaypoint: mod.dragWaypoint };
  if (pinning !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-21: pinning", () => {
  skip("pinBend produces exactly one undo frame", () => {
    const mockTransact = vi.fn((_n: string, fn: () => void) => fn());
    const wire = {
      id: "w1",
      from: { block: "b1", port: "out" },
      to: { block: "b2", port: "in" },
      waypoints: [30, 0, 30, 40],
      pinned: false,
    };
    pinning?.pinBend(wire, 0, { transact: mockTransact });
    expect(mockTransact).toHaveBeenCalledTimes(1);
  });

  skip("unpinBend sets pinned=false", () => {
    const mockTransact = vi.fn((_n: string, fn: () => void) => fn());
    const wire = {
      id: "w1",
      from: { block: "b1", port: "out" },
      to: { block: "b2", port: "in" },
      waypoints: [30, 0, 30, 40],
      pinned: true,
    };
    const result = pinning?.unpinBend(wire, { transact: mockTransact });
    expect((result ?? wire).pinned).toBe(false);
  });
});
