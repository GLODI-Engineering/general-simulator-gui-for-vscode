import { toModel } from "../coords";

export interface GridViewport {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface GridDot {
  x: number;
  y: number;
}

function thinningMultiplier(zoom: number): number {
  if (zoom >= 1) {
    return 1;
  }
  if (zoom >= 0.4) {
    return 2;
  }
  if (zoom >= 0.2) {
    return 4;
  }
  return 8;
}

export function thinGrid(gridStep: number, viewport: GridViewport): GridDot[] {
  if (viewport.width <= 0 || viewport.height <= 0 || gridStep <= 0 || viewport.zoom <= 0) {
    return [];
  }

  const step = gridStep * thinningMultiplier(viewport.zoom);
  const topLeft = toModel({ x: 0, y: 0 }, viewport);
  const bottomRight = toModel({ x: viewport.width, y: viewport.height }, viewport);

  const minX = Math.floor(Math.min(topLeft.x, bottomRight.x) / step) * step;
  const maxX = Math.ceil(Math.max(topLeft.x, bottomRight.x) / step) * step;
  const minY = Math.floor(Math.min(topLeft.y, bottomRight.y) / step) * step;
  const maxY = Math.ceil(Math.max(topLeft.y, bottomRight.y) / step) * step;

  const dots: GridDot[] = [];
  for (let x = minX; x <= maxX; x += step) {
    for (let y = minY; y <= maxY; y += step) {
      dots.push({ x, y });
      if (dots.length >= 10_000) {
        return dots;
      }
    }
  }
  return dots;
}

export const computeGridPoints = thinGrid;
