import type { Primitive } from "../canvas/nodes/primitive-renderer";

/** Shift every coordinate field of *primitive* by (dx, dy). Mirrors the
 * per-kind field handling gsim_model.symbol.Primitive.translate() uses on
 * the Python side (packages/gsim-model/src/gsim_model/symbol.py) — kept
 * independent since this operates on the frontend's own Primitive union,
 * not the Python dataclasses. */
export function translatePrimitive(primitive: Primitive, dx: number, dy: number): Primitive {
  switch (primitive.type) {
    case "line":
      return {
        ...primitive,
        x1: primitive.x1 + dx,
        y1: primitive.y1 + dy,
        x2: primitive.x2 + dx,
        y2: primitive.y2 + dy,
      };
    case "rect":
    case "rectf":
      return { ...primitive, x: primitive.x + dx, y: primitive.y + dy };
    case "circle":
      return { ...primitive, cx: primitive.cx + dx, cy: primitive.cy + dy };
    case "arc":
      return { ...primitive, cx: primitive.cx + dx, cy: primitive.cy + dy };
    case "polygon":
    case "polyline":
      return { ...primitive, pts: primitive.pts.map(([x, y]) => [x + dx, y + dy]) };
    case "text":
      return { ...primitive, x: primitive.x + dx, y: primitive.y + dy };
  }
}

// FE-176: selection resize/rotate handles.

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A single-word text primitive has no intrinsic width — approximate it
 * from character count so the selection box roughly frames the label.
 * Purely a UI sizing aid, never persisted. */
function estimateTextWidth(text: string, size: number): number {
  return Math.max(4, text.length * size * 0.62);
}

/** Axis-aligned bounding box in the primitive's own (unrotated) local
 * frame — the selection UI applies the primitive's own rotation transform
 * on top when drawing the box, so this never needs to account for
 * rotation itself. */
export function primitiveBBox(primitive: Primitive): BBox {
  switch (primitive.type) {
    case "rect":
    case "rectf":
      return { x: primitive.x, y: primitive.y, w: primitive.w, h: primitive.h };
    case "circle":
    case "arc":
      return {
        x: primitive.cx - primitive.r,
        y: primitive.cy - primitive.r,
        w: primitive.r * 2,
        h: primitive.r * 2,
      };
    case "line": {
      const x = Math.min(primitive.x1, primitive.x2);
      const y = Math.min(primitive.y1, primitive.y2);
      return {
        x,
        y,
        w: Math.abs(primitive.x2 - primitive.x1),
        h: Math.abs(primitive.y2 - primitive.y1),
      };
    }
    case "polygon":
    case "polyline": {
      const xs = primitive.pts.map((p) => p[0]);
      const ys = primitive.pts.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case "text": {
      const size = primitive.size ?? 9;
      const w = estimateTextWidth(primitive.text, size);
      return { x: primitive.x - w / 2, y: primitive.y - size / 2, w, h: size };
    }
  }
}

/** The 8 standard resize-handle positions. Corner ids combine both edge
 * letters ("nw" = north + west) so `handleId.includes("n"/"s"/"e"/"w")`
 * picks out which side(s) a drag affects. */
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLE_DIRECTION: Record<ResizeHandle, [number, number]> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
  ne: [Math.SQRT1_2, -Math.SQRT1_2],
  nw: [-Math.SQRT1_2, -Math.SQRT1_2],
  se: [Math.SQRT1_2, Math.SQRT1_2],
  sw: [-Math.SQRT1_2, Math.SQRT1_2],
};

const MIN_SIZE = 1;

/** Resize *primitive* given a drag of (dx, dy) — already converted into the
 * primitive's own unrotated local frame, see rotateVector() below — applied
 * from the given handle. Rect/rectf resize both dimensions independently
 * per handle; circle/arc/text have only one size parameter (radius/font
 * size), so every handle uniformly scales it via the drag's component
 * along that handle's direction from the shape's center. */
export function resizePrimitive(
  primitive: Primitive,
  handle: ResizeHandle,
  dx: number,
  dy: number,
): Primitive {
  switch (primitive.type) {
    case "rect":
    case "rectf": {
      let { x, y, w, h } = primitive;
      if (handle.includes("w")) {
        x += dx;
        w -= dx;
      }
      if (handle.includes("e")) {
        w += dx;
      }
      if (handle.includes("n")) {
        y += dy;
        h -= dy;
      }
      if (handle.includes("s")) {
        h += dy;
      }
      if (w < MIN_SIZE) {
        x -= MIN_SIZE - w;
        w = MIN_SIZE;
      }
      if (h < MIN_SIZE) {
        y -= MIN_SIZE - h;
        h = MIN_SIZE;
      }
      return { ...primitive, x, y, w, h };
    }
    case "circle": {
      const [dirX, dirY] = HANDLE_DIRECTION[handle];
      const r = Math.max(MIN_SIZE, primitive.r + (dx * dirX + dy * dirY));
      return { ...primitive, r };
    }
    case "text": {
      const [dirX, dirY] = HANDLE_DIRECTION[handle];
      const size = Math.max(MIN_SIZE, (primitive.size ?? 9) + (dx * dirX + dy * dirY));
      return { ...primitive, size };
    }
    default:
      return primitive;
  }
}

/** Rotates a screen-space delta into a primitive's own local (unrotated)
 * frame — inverse of the SVG `rotate(rotation, cx, cy)` transform the
 * selection box shares with the shape, so dragging a handle still resizes
 * along the shape's own axes after it's been rotated. */
export function toLocalDelta(dx: number, dy: number, rotationDegrees: number): [number, number] {
  const rad = (-rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

/** Primitive kinds whose rotation is meaningful and persisted (rect/rectf/
 * text — circle is schema-symmetric but visually rotation-invariant, so
 * it's intentionally excluded here; line/arc/polygon/polyline already
 * express any orientation directly through their own point coordinates). */
export function supportsRotation(
  primitive: Primitive,
): primitive is Extract<Primitive, { type: "rect" | "rectf" | "text" }> {
  return primitive.type === "rect" || primitive.type === "rectf" || primitive.type === "text";
}

/** Sets a primitive's own rotation (degrees). A no-op for kinds that don't
 * carry a rotation field (see supportsRotation). */
export function setPrimitiveRotation(primitive: Primitive, rotation: number): Primitive {
  if (!supportsRotation(primitive)) return primitive;
  return { ...primitive, rotation };
}
