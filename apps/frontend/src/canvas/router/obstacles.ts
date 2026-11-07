/**
 * FE-98: Obstacle model for the orthogonal auto-router.
 *
 * Pure, DOM-free. Operates on .gsim_sch integer coordinates. Ported from the
 * reference editor `schematic_editor.html` (getObstacles / compBBox).
 */

/** Padding (px / grid units) applied around every component bounding box. */
export const PAD = 4;

/** Axis-aligned obstacle box in world coordinates. */
export interface ObstacleBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A component as seen by the router: its unrotated top-left position and size,
 * its rotation in degrees (0/90/180/270), and the absolute world coordinates
 * of its ports.
 */
export interface RouterComponent {
  position: [number, number];
  size: { w: number; h: number };
  rotation: number;
  ports: Array<{ x: number; y: number }>;
}

/**
 * Axis-aligned bounding box of a component, padded by `pad`. For a rotated
 * component the box encloses all four rotated corners (still axis-aligned).
 */
export function compBBox(c: RouterComponent, pad = 0): ObstacleBox {
  const [x, y] = c.position;
  const { w, h } = c.size;
  if (!c.rotation) {
    return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  const a = (c.rotation * Math.PI) / 180;
  const hw = w / 2 + pad;
  const hh = h / 2 + pad;
  const corners = (
    [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as Array<[number, number]>
  ).map(([px, py]) => ({
    x: cx + px * Math.cos(a) - py * Math.sin(a),
    y: cy + px * Math.sin(a) + py * Math.cos(a),
  }));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** Is `(x, y)` strictly inside `box`? */
function inside(box: ObstacleBox, x: number, y: number): boolean {
  return x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h;
}

/**
 * Padded obstacle boxes for every component, except one the wire could not
 * otherwise reach.
 *
 * This used to drop *both* components a wire connects to, so that a wire was
 * never blocked by the parts it joins. The intent is right and the rule was
 * too broad: dropping a component does not only let the wire reach its port,
 * it lets the wire run clean across that component's body on the way there --
 * which is what put a wire through the face of a switch whose port sits on
 * the far side.
 *
 * A wire endpoint is a port's *stub tip*, a lead-length outside the body,
 * while the padding here is a few units -- so the endpoint is already outside
 * the padded box, and the component can be an obstacle like any other. The
 * exclusion is kept only for the case it was written for: an endpoint that
 * really does fall inside the box, where keeping the obstacle would make the
 * port unreachable.
 */
export function getObstacles(
  comps: RouterComponent[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
): ObstacleBox[] {
  const boxes: ObstacleBox[] = [];
  for (const c of comps) {
    const box = compBBox(c, PAD);
    if (inside(box, ax, ay) || inside(box, bx, by)) {
      continue;
    }
    boxes.push(box);
  }
  return boxes;
}
