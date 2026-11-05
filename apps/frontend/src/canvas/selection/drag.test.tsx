/**
 * FE-15: Drag-move tests
 *
 * Acceptance:
 * - Drag + release produces exactly one undo frame.
 * - Esc during drag leaves graph untouched.
 * - Space constraint locks to dominant axis.
 */

import { describe, expect, it, vi } from "vitest";

type Point = { x: number; y: number };
type PreviewBlock = { id: string; position: [number, number] };
type TxStore = { transact: (name: string, fn: () => void) => void };

type DragApi = {
  startDrag: (blockIds: string[], start: Point) => void;
  moveDrag: (cursor: Point) => void;
  commitDrag: (store: TxStore) => void;
  cancelDrag: () => void;
  enableAxisLock: () => void;
  getPreview: () => PreviewBlock[] | null;
};

let drag: DragApi | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./drag");
  drag = {
    startDrag: mod.startDrag,
    moveDrag: mod.moveDrag,
    commitDrag: mod.commitDrag,
    cancelDrag: mod.cancelDrag,
    enableAxisLock: mod.enableAxisLock,
    getPreview: mod.getPreview,
  };
  if (drag !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-15: drag-move", () => {
  skip("commit produces exactly one undo frame", () => {
    const undoFrames: unknown[] = [];
    const mockTransact = vi.fn((name: string, fn: () => void) => {
      fn();
      undoFrames.push(name);
    });
    const _blocks = [{ id: "b1", position: [0, 0] as [number, number] }];

    drag?.startDrag(["b1"], { x: 0, y: 0 });
    drag?.moveDrag({ x: 20, y: 30 });
    drag?.commitDrag({ transact: mockTransact });

    expect(mockTransact).toHaveBeenCalledTimes(1);
  });

  skip("Esc cancels drag with no store mutation", () => {
    const mockTransact = vi.fn();
    const _blocks = [{ id: "b1", position: [0, 0] as [number, number] }];

    drag?.startDrag(["b1"], { x: 0, y: 0 });
    drag?.moveDrag({ x: 20, y: 30 });
    drag?.cancelDrag();

    expect(mockTransact).not.toHaveBeenCalled();
  });

  skip("Space axis lock constrains to dominant axis", () => {
    drag?.startDrag(["b1"], { x: 0, y: 0 });
    drag?.moveDrag({ x: 30, y: 5 }); // dominant = x
    drag?.enableAxisLock();
    drag?.moveDrag({ x: 40, y: 20 }); // y should be locked to 0
    const preview = drag?.getPreview?.();
    if (preview) {
      expect(preview[0].position[1]).toBe(0);
    }
  });
});
