import { describe, expect, it } from "vitest";
import { isOrthogonalPolyline, snapNearOrthogonal } from "./wire-path";

// FE-90 — Custom waypoint-aware wire edge renderer
// Scaffold-only tests. Implement full assertions from progress.frontend.yaml acceptance bullets.
// Acceptance checklist:
// - test_wire_edge_polyline: WireEdge renders source, waypoint, and target coordinates in order.
// - test_non_orthogonal_detected: non-orthogonal waypoint input is detected.
// - test_derive_wire_edge_type: deriveFlowEdges emits type wire with wire data intact.
// - test_canvas_direct_drag_visible: direct port-drag wire remains visible with custom edge type.

describe("FE-90 scaffold", () => {
  it.todo("implement acceptance coverage");
});

describe("FE-156: isOrthogonalPolyline tolerance for near-miss endpoints", () => {
  it("a perfectly axis-aligned polyline is orthogonal", () => {
    expect(
      isOrthogonalPolyline([
        [72, 189],
        [230, 189],
        [230, 44],
        [382, 44],
      ]),
    ).toBe(true);
  });

  it("a small (<= 6px) endpoint mismatch, matching the real buck-schematic case, still counts as orthogonal", () => {
    // Reproduces the exact live data captured from insertBuckSchematic():
    // the waypoint's own y (184/49) doesn't exactly match ReactFlow's
    // reported handle y (189/44) for the same port.
    expect(
      isOrthogonalPolyline([
        [72, 189],
        [230, 184],
        [230, 44],
        [382, 49],
      ]),
    ).toBe(true);
  });

  it("a genuinely diagonal segment (large mismatch on both axes) is still rejected", () => {
    expect(
      isOrthogonalPolyline([
        [72, 189],
        [230, 40], // 158px x, 149px y — a real diagonal, not a rounding artifact.
      ]),
    ).toBe(false);
  });

  it("a segment exactly at the tolerance boundary (6px) is orthogonal; one px over is not", () => {
    expect(
      isOrthogonalPolyline([
        [0, 0],
        [100, 6],
      ]),
    ).toBe(true);
    expect(
      isOrthogonalPolyline([
        [0, 0],
        [100, 7],
      ]),
    ).toBe(false);
  });
});

describe("snapNearOrthogonal: correcting a near-miss without discarding a real short leg", () => {
  it("regression: a live source, a stored bend that differs from the live source by only y, and a live target that differs from the bend by both axes — the bend must be pinned to both, not collapsed", () => {
    // Reproduces the exact case found reproducing a real control-loop diagram: a
    // control.sum block's port resolved a couple of px differently between the router's
    // own computation (used to place the stored waypoint) and ReactFlow's rendered handle
    // (used as the live ends here) — dx=0/dy=3 next to the source, dx=54/dy=5 next to the
    // target. The old "both axes within tolerance -> collapse to a point" rule discarded
    // the source-side leg entirely, leaving a single, visibly diagonal segment straight to
    // the target.
    expect(
      snapNearOrthogonal([
        [280, 37], // live source
        [280, 40], // stored waypoint
        [334, 45], // live target
      ]),
    ).toEqual([
      [280, 37],
      [280, 45],
      [334, 45],
    ]);
  });

  it("live endpoints are never moved — only interior points are adjusted", () => {
    const snapped = snapNearOrthogonal([
      [10, 10],
      [12, 60],
      [90, 92],
    ]);
    expect(snapped[0]).toEqual([10, 10]);
    expect(snapped[snapped.length - 1]).toEqual([90, 92]);
  });

  it("an already-exact polyline is returned unchanged", () => {
    const points: Array<[number, number]> = [
      [0, 0],
      [50, 0],
      [50, 80],
    ];
    expect(snapNearOrthogonal(points)).toEqual(points);
  });

  it("a middle segment strictly between the two corrected ends is left untouched", () => {
    // Only the segments touching a live endpoint (index 0 and the last index) are ever
    // corrected. With three interior waypoints, the middle one (index 2) isn't adjacent to
    // either live endpoint, so it must survive exactly as given.
    const snapped = snapNearOrthogonal([
      [0, 0], // live source
      [10, 10], // touched by the source-side correction
      [50, 10], // untouched — not adjacent to either live endpoint
      [93, 90], // touched by the target-side correction
      [93, 100], // live target
    ]);
    expect(snapped[2]).toEqual([50, 10]);
  });

  it("a plain 2-point near-miss (no stored waypoints at all) snaps toward the source", () => {
    expect(
      snapNearOrthogonal([
        [50, 50],
        [50, 210],
      ]),
    ).toEqual([
      [50, 50],
      [50, 210],
    ]);
    expect(
      snapNearOrthogonal([
        [50, 50],
        [53, 210],
      ]),
    ).toEqual([
      [50, 50],
      [50, 210],
    ]);
  });
});
