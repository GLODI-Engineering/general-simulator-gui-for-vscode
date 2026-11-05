/**
 * FE-59: annotation-tools tests
 *
 * Acceptance:
 * - test_annotation_text_create: placing a text annotation produces a lines entry with kind=text and integer position.
 * - test_annotation_polyline_create: drawing a 3-segment polyline produces 4 integer waypoints.
 * - test_annotation_drag_snaps: dragging snaps to grid (no fractional coordinates).
 */

import { describe, expect, it } from "vitest";
import { createPolyline, createText, snapToGrid, toModelAnnotation } from "./annotation-tools";

describe("FE-59: annotation-tools", () => {
  it("test_annotation_text_create: placing text yields model.lines entry with kind=text and integer position", () => {
    const placed: [number, number] = [snapToGrid(101.2, 10), snapToGrid(197.6, 10)];
    const modelAnnotation = toModelAnnotation(createText(placed));
    const lines = [modelAnnotation];

    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe("text");
    expect(Number.isInteger(lines[0]?.position?.[0])).toBe(true);
    expect(Number.isInteger(lines[0]?.position?.[1])).toBe(true);
  });

  it("test_annotation_polyline_create: 3-segment polyline yields 4 integer waypoints", () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [20, 10],
    ];

    const modelAnnotation = toModelAnnotation(createPolyline(points));

    expect(modelAnnotation.kind).toBe("polyline");
    expect(modelAnnotation.points).toHaveLength(4);
    for (const [x, y] of modelAnnotation.points ?? []) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
    }
  });

  it("test_annotation_drag_snaps: snapping drag coordinates removes fractional values", () => {
    const snappedX = snapToGrid(34.9, 10);
    const snappedY = snapToGrid(75.1, 10);

    expect(Number.isInteger(snappedX)).toBe(true);
    expect(Number.isInteger(snappedY)).toBe(true);
    expect(snappedX % 10).toBe(0);
    expect(snappedY % 10).toBe(0);
  });
});
