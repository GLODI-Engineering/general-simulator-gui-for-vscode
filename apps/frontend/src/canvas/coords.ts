export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export interface Point {
  x: number;
  y: number;
}

export function toScreen(model: Point, viewport: ViewTransform): Point {
  return {
    x: Math.round(model.x * viewport.zoom + viewport.panX),
    y: Math.round(model.y * viewport.zoom + viewport.panY),
  };
}

export function toModel(screen: Point, viewport: ViewTransform): Point {
  return {
    x: Math.round((screen.x - viewport.panX) / viewport.zoom),
    y: Math.round((screen.y - viewport.panY) / viewport.zoom),
  };
}
