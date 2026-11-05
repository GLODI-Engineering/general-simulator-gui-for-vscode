/**
 * FE-101: Wire segment dragging with orthogonal re-normalisation.
 *
 * Pure, DOM-free. A user grabs an interior wire segment and drags it
 * perpendicular to its axis; the two wire endpoints stay pinned and the
 * polyline is re-normalised to stay strictly orthogonal and collinear-
 * simplified. Ported from the reference editor `schematic_editor.html`
 * (applySegDrag, ensureOrtho, simplifyPts).
 */

import { type Point, ensureOrtho, simplifyPts } from "../router/ortho-route";

export interface SegDrag {
  wireId: string;
  /** Index of the dragged segment: the pair (points[segIdx], points[segIdx+1]). */
  segIdx: number;
  /** 'h' = horizontal segment (drag changes y); 'v' = vertical (drag changes x). */
  axis: "h" | "v";
  /** Wire waypoints captured at drag start. */
  origPts: Point[];
}

/**
 * Move the dragged segment to `newValue` (its new y for a horizontal segment, x
 * for a vertical one), drag the adjacent join rows with it, then re-pin the two
 * endpoints and re-orthogonalize. A horizontal-segment drag changes only y; a
 * vertical-segment drag changes only x.
 */
export function applySegDrag(sd: SegDrag, newValue: number): Point[] {
  const pts: Point[] = sd.origPts.map((p) => [p[0], p[1]]);
  if (pts.length < 2) {
    return pts;
  }
  const firstPt = pts[0];
  const lastPt = pts[pts.length - 1];
  const axisIdx = sd.axis === "h" ? 1 : 0;
  const i = sd.segIdx;

  const setAxis = (idx: number) => {
    const p = pts[idx];
    if (p) {
      p[axisIdx] = newValue;
    }
  };
  setAxis(i);
  setAxis(i + 1);
  if (i > 0) {
    setAxis(i - 1);
  }
  if (i + 2 < pts.length) {
    setAxis(i + 2);
  }

  if (firstPt) {
    pts[0] = [firstPt[0], firstPt[1]];
  }
  if (lastPt) {
    pts[pts.length - 1] = [lastPt[0], lastPt[1]];
  }
  return simplifyPts(ensureOrtho(pts));
}

/**
 * Run the segment-drag result through a single store transact so the whole drag
 * is reversible by one undo (FE-101).
 */
export function commitSegmentDrag(
  store: { transact: (name: string, fn: () => void) => void },
  apply: () => void,
): void {
  store.transact("segment-drag", () => {
    apply();
  });
}
