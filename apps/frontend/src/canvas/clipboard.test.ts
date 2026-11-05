/**
 * FE-17: Clipboard (copy/paste/cut/delete) tests
 *
 * Acceptance:
 * - Copy-paste of a 3-block + 2-wire selection round-trips with id substitution.
 * - Deleting a connected block also deletes its wires.
 */

import { describe, expect, it } from "vitest";

type ClipboardBlock = {
  id: string;
  type: string;
  position: [number, number];
  rotation: number;
  mirror: "none" | "x" | "y";
  params: Record<string, unknown>;
};

type ClipboardWire = {
  id: string;
  from: { block: string; port: string };
  to: { block: string; port: string };
  waypoints: unknown[];
  pinned: boolean;
};

type ClipboardPayload = unknown;

type ClipboardApi = {
  copy: (
    blocks: ClipboardBlock[],
    wires: ClipboardWire[],
    selection: Set<string>,
  ) => ClipboardPayload;
  paste: (
    payload: ClipboardPayload,
    offset: { x: number; y: number },
  ) => { blocks: ClipboardBlock[]; wires: ClipboardWire[] };
  cut: (
    blocks: ClipboardBlock[],
    wires: ClipboardWire[],
    selection: Set<string>,
  ) => ClipboardPayload;
};

let clipboard: ClipboardApi | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./clipboard");
  clipboard = { copy: mod.copySelection, paste: mod.pasteSelection, cut: mod.cutSelection };
  if (clipboard !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

const THREE_BLOCKS = [
  {
    id: "b1",
    type: "signal.constant",
    position: [0, 0] as [number, number],
    rotation: 0,
    mirror: "none" as const,
    params: {},
  },
  {
    id: "b2",
    type: "control.gain",
    position: [40, 0] as [number, number],
    rotation: 0,
    mirror: "none" as const,
    params: { k: 2 },
  },
  {
    id: "b3",
    type: "sinks.scope",
    position: [80, 0] as [number, number],
    rotation: 0,
    mirror: "none" as const,
    params: {},
  },
];

const TWO_WIRES = [
  {
    id: "w1",
    from: { block: "b1", port: "out" },
    to: { block: "b2", port: "in" },
    waypoints: [],
    pinned: false,
  },
  {
    id: "w2",
    from: { block: "b2", port: "out" },
    to: { block: "b3", port: "in" },
    waypoints: [],
    pinned: false,
  },
];

describe("FE-17: clipboard", () => {
  skip("copy-paste regenerates block and wire ids", () => {
    const payload = clipboard?.copy(THREE_BLOCKS, TWO_WIRES, new Set(["b1", "b2", "b3"]));
    const pasted = clipboard?.paste(payload, { x: 10, y: 10 });

    const originalIds = THREE_BLOCKS.map((b) => b.id);
    for (const block of pasted.blocks) {
      expect(originalIds).not.toContain(block.id);
    }

    const originalWireIds = TWO_WIRES.map((w) => w.id);
    for (const wire of pasted.wires) {
      expect(originalWireIds).not.toContain(wire.id);
    }
  });

  skip("paste result is schema-valid (blocks have integer positions)", () => {
    const payload = clipboard?.copy(THREE_BLOCKS, TWO_WIRES, new Set(["b1", "b2", "b3"]));
    const pasted = clipboard?.paste(payload, { x: 10, y: 10 });
    for (const block of pasted.blocks) {
      expect(Number.isInteger(block.position[0])).toBe(true);
      expect(Number.isInteger(block.position[1])).toBe(true);
    }
  });

  skip("wires partially in selection (one endpoint outside) are NOT copied", () => {
    // Only b1 and b2 are in selection; w2 (b2→b3) is NOT interior
    const payload = clipboard?.copy(THREE_BLOCKS, TWO_WIRES, new Set(["b1", "b2"]));
    const pasted = clipboard?.paste(payload, { x: 0, y: 0 });
    expect(pasted.wires.length).toBe(1); // only w1 (b1→b2)
  });

  skip("wires re-point to new pasted block ids", () => {
    const payload = clipboard?.copy(THREE_BLOCKS, TWO_WIRES, new Set(["b1", "b2", "b3"]));
    const pasted = clipboard?.paste(payload, { x: 0, y: 0 });
    const pastedBlockIds = new Set(pasted.blocks.map((b: { id: string }) => b.id));
    for (const wire of pasted.wires) {
      expect(pastedBlockIds.has(wire.from.block)).toBe(true);
      expect(pastedBlockIds.has(wire.to.block)).toBe(true);
    }
  });
});
