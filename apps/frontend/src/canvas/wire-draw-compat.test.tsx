/**
 * FE-56: wire-draw compatibility tests
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { wireDrawCursor } from "./CanvasOverlay";
import {
  cancelDraw,
  commitToPort,
  getHoverState,
  isDrawing,
  moveDraw,
  startDraw,
} from "./wire-draw";

afterEach(() => {
  cancelDraw();
});

describe("FE-56: wire-draw-compat", () => {
  it("test_wire_draw_refuses_cross_paradigm", () => {
    startDraw(
      { blockId: "src", portId: "out", kind: "signal", direction: "out" },
      { x: 10, y: 10 },
    );

    moveDraw(
      { x: 120, y: 20 },
      {
        blockId: "dst",
        portId: "p",
        port: { kind: "physical-electrical", direction: "inout" },
      },
    );

    const hover = getHoverState();
    expect(hover.compat).toEqual({ ok: false, reason: "kind-mismatch" });
    expect(wireDrawCursor()).toBe("not-allowed");

    const transact = vi.fn((_name: string, fn: () => void) => fn());
    const result = commitToPort(
      { blockId: "dst", portId: "p" },
      { kind: "physical-electrical", direction: "inout" },
      { transact },
    );

    expect(result).toEqual({ ok: false, reason: "kind-mismatch" });
    expect(transact).not.toHaveBeenCalled();
    expect(isDrawing()).toBe(true);
  });
});
