/**
 * Snap helper — resolves a pointer position to the nearest snap target.
 *
 * Priority: port > wire > grid (coarsest-grid rule applied when selectionGridSteps given).
 */

export type SnapKind = "port" | "wire" | "grid";

export interface PortTarget {
  blockId: string;
  portId: string;
  x: number;
  y: number;
}

export interface WireTarget {
  id: string;
  points: { x: number; y: number }[];
}

export interface SnapOptions {
  ports: PortTarget[];
  wires: WireTarget[];
  gridStep: number;
  snapRadius: number;
  zoom: number;
  /** When multiple selection items have different grid steps, pass all; coarsest wins. */
  selectionGridSteps?: number[];
}

export interface SnapResult {
  kind: SnapKind;
  x: number;
  y: number;
  refId?: string;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/** Distance from point (px,py) to axis-aligned line segment (x0,y0)-(x1,y1). */
function distToSegment(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, x0, y0);
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lenSq));
  return dist(px, py, x0 + t * dx, y0 + t * dy);
}

export function snap(pointer: { x: number; y: number }, opts: SnapOptions): SnapResult {
  const { ports, wires, snapRadius, zoom } = opts;
  const radius = snapRadius / zoom;

  // 1. Port priority — pick the nearest port within radius
  let bestPort: PortTarget | null = null;
  let bestPortDist = Number.POSITIVE_INFINITY;
  for (const port of ports) {
    const d = dist(pointer.x, pointer.y, port.x, port.y);
    if (d <= radius && d < bestPortDist) {
      bestPort = port;
      bestPortDist = d;
    }
  }
  if (bestPort) {
    return {
      kind: "port",
      x: bestPort.x,
      y: bestPort.y,
      refId: `${bestPort.blockId}:${bestPort.portId}`,
    };
  }

  // 2. Wire body
  for (const wire of wires) {
    for (let i = 0; i < wire.points.length - 1; i++) {
      const a = wire.points[i];
      const b = wire.points[i + 1];
      if (!a || !b) continue;
      if (distToSegment(pointer.x, pointer.y, a.x, a.y, b.x, b.y) <= radius) {
        return { kind: "wire", x: Math.round(pointer.x), y: Math.round(pointer.y), refId: wire.id };
      }
    }
  }

  // 3. Grid snap — use coarsest step when selectionGridSteps provided
  const steps =
    opts.selectionGridSteps && opts.selectionGridSteps.length > 0
      ? opts.selectionGridSteps
      : [opts.gridStep];
  const step = Math.max(...steps);

  const gx = Math.round(pointer.x / step) * step;
  const gy = Math.round(pointer.y / step) * step;
  return { kind: "grid", x: gx, y: gy };
}

export default snap;
