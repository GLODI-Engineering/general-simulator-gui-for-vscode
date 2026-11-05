import { describe, expect, it } from "vitest";
import {
  primitiveBBox,
  resizePrimitive,
  setPrimitiveRotation,
  supportsRotation,
  toLocalDelta,
  translatePrimitive,
} from "./primitive-ops";

describe("FE-174: translatePrimitive", () => {
  it("shifts a line's both endpoints", () => {
    const line = { type: "line" as const, x1: 0, y1: 0, x2: 10, y2: 5 };
    expect(translatePrimitive(line, 3, 4)).toEqual({ type: "line", x1: 3, y1: 4, x2: 13, y2: 9 });
  });

  it("shifts a rect's origin, not its size", () => {
    const rect = { type: "rect" as const, x: 0, y: 0, w: 20, h: 10 };
    expect(translatePrimitive(rect, 5, -5)).toEqual({ type: "rect", x: 5, y: -5, w: 20, h: 10 });
  });

  it("shifts a circle's center, not its radius", () => {
    const circle = { type: "circle" as const, cx: 10, cy: 10, r: 4 };
    expect(translatePrimitive(circle, 2, 2)).toEqual({ type: "circle", cx: 12, cy: 12, r: 4 });
  });

  it("shifts every point of a polygon", () => {
    const polygon = {
      type: "polygon" as const,
      pts: [
        [0, 0],
        [10, 0],
        [5, 10],
      ] as Array<[number, number]>,
    };
    expect(translatePrimitive(polygon, 1, 1)).toEqual({
      type: "polygon",
      pts: [
        [1, 1],
        [11, 1],
        [6, 11],
      ],
    });
  });

  it("shifts a text primitive's anchor point", () => {
    const text = { type: "text" as const, x: 5, y: 5, text: "hi" };
    expect(translatePrimitive(text, -2, 3)).toEqual({ type: "text", x: 3, y: 8, text: "hi" });
  });
});

describe("FE-176: primitiveBBox", () => {
  it("returns a rect's own box directly", () => {
    const rect = { type: "rect" as const, x: 2, y: 3, w: 10, h: 5 };
    expect(primitiveBBox(rect)).toEqual({ x: 2, y: 3, w: 10, h: 5 });
  });

  it("returns a circle's box centered on (cx, cy) with side 2r", () => {
    const circle = { type: "circle" as const, cx: 10, cy: 10, r: 4 };
    expect(primitiveBBox(circle)).toEqual({ x: 6, y: 6, w: 8, h: 8 });
  });

  it("returns a polygon's box as the min/max extent of its points", () => {
    const polygon = {
      type: "polygon" as const,
      pts: [
        [0, 5],
        [10, 0],
        [4, 12],
      ] as Array<[number, number]>,
    };
    expect(primitiveBBox(polygon)).toEqual({ x: 0, y: 0, w: 10, h: 12 });
  });

  it("returns a text box centered on its anchor, sized from font size", () => {
    const text = { type: "text" as const, x: 10, y: 10, text: "AB", size: 8 };
    const bbox = primitiveBBox(text);
    expect(bbox.h).toBe(8);
    expect(bbox.y).toBe(6); // 10 - size/2
    expect(bbox.x).toBeLessThan(10);
    expect(bbox.w).toBeGreaterThan(0);
  });
});

describe("FE-176: resizePrimitive", () => {
  it("dragging the se handle grows a rect's w/h, leaving x/y fixed", () => {
    const rect = { type: "rect" as const, x: 0, y: 0, w: 20, h: 10 };
    expect(resizePrimitive(rect, "se", 5, 3)).toEqual({ type: "rect", x: 0, y: 0, w: 25, h: 13 });
  });

  it("dragging the nw handle moves x/y and shrinks w/h symmetrically", () => {
    const rect = { type: "rect" as const, x: 0, y: 0, w: 20, h: 10 };
    expect(resizePrimitive(rect, "nw", 5, 2)).toEqual({ type: "rect", x: 5, y: 2, w: 15, h: 8 });
  });

  it("dragging the e handle only changes width", () => {
    const rect = { type: "rect" as const, x: 0, y: 0, w: 20, h: 10 };
    expect(resizePrimitive(rect, "e", 5, 100)).toEqual({ type: "rect", x: 0, y: 0, w: 25, h: 10 });
  });

  it("does not let a rect collapse to zero/negative width or height", () => {
    const rect = { type: "rect" as const, x: 0, y: 0, w: 20, h: 10 };
    const resized = resizePrimitive(rect, "e", -100, 0);
    expect(resized.type).toBe("rect");
    if (resized.type === "rect") {
      expect(resized.w).toBeGreaterThanOrEqual(1);
    }
  });

  it("dragging any circle handle outward grows the radius uniformly", () => {
    const circle = { type: "circle" as const, cx: 10, cy: 10, r: 5 };
    const resized = resizePrimitive(circle, "e", 3, 0);
    expect(resized).toEqual({ type: "circle", cx: 10, cy: 10, r: 8 });
  });

  it("dragging a text handle outward grows the font size", () => {
    const text = { type: "text" as const, x: 10, y: 10, text: "Q", size: 8 };
    const resized = resizePrimitive(text, "s", 0, 4);
    expect(resized).toEqual({ type: "text", x: 10, y: 10, text: "Q", size: 12 });
  });

  it("is a no-op for kinds it doesn't resize (line)", () => {
    const line = { type: "line" as const, x1: 0, y1: 0, x2: 10, y2: 0 };
    expect(resizePrimitive(line, "e", 5, 5)).toEqual(line);
  });
});

describe("FE-176: setPrimitiveRotation / supportsRotation", () => {
  it("supportsRotation is true for rect/rectf/text, false for the rest", () => {
    expect(supportsRotation({ type: "rect", x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(supportsRotation({ type: "rectf", x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(supportsRotation({ type: "text", x: 0, y: 0, text: "x" })).toBe(true);
    expect(supportsRotation({ type: "circle", cx: 0, cy: 0, r: 1 })).toBe(false);
    expect(supportsRotation({ type: "line", x1: 0, y1: 0, x2: 1, y2: 1 })).toBe(false);
  });

  it("sets rotation on a rect", () => {
    const rect = { type: "rect" as const, x: 0, y: 0, w: 10, h: 5 };
    expect(setPrimitiveRotation(rect, 45)).toEqual({
      type: "rect",
      x: 0,
      y: 0,
      w: 10,
      h: 5,
      rotation: 45,
    });
  });

  it("is a no-op for a circle (rotation-invariant, excluded on purpose)", () => {
    const circle = { type: "circle" as const, cx: 0, cy: 0, r: 5 };
    expect(setPrimitiveRotation(circle, 45)).toEqual(circle);
  });
});

describe("FE-176: toLocalDelta", () => {
  it("is the identity when rotation is 0", () => {
    expect(toLocalDelta(5, -3, 0)).toEqual([5, -3]);
  });

  it("rotates a screen delta into the shape's local frame at 90 degrees", () => {
    const [dx, dy] = toLocalDelta(1, 0, 90);
    expect(dx).toBeCloseTo(0, 10);
    expect(dy).toBeCloseTo(-1, 10);
  });
});
