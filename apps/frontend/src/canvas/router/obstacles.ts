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

/**
 * Padded obstacle boxes for every component except the two whose ports sit at
 * the wire endpoints (within 2px). Those two are excluded so a wire is never
 * blocked by the components it is connecting.
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
    const atA = c.ports.some((p) => Math.hypot(p.x - ax, p.y - ay) < 2);
    const atB = c.ports.some((p) => Math.hypot(p.x - bx, p.y - by) < 2);
    if (atA || atB) {
      continue;
    }
    boxes.push(compBBox(c, PAD));
  }
  return boxes;
}
