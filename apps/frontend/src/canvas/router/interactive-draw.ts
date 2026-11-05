import type { Wire } from "../../model/types";

type Posture = "horizontal-first" | "vertical-first";

let drawState: {
  start: { blockId: string; portId: string };
  from: { x: number; y: number };
  to: { x: number; y: number };
  posture: Posture;
} | null = null;

export function startDraw(
  start: { blockId: string; portId: string },
  point: { x: number; y: number },
) {
  drawState = { start, from: point, to: point, posture: "horizontal-first" };
}

export function moveDraw(point: { x: number; y: number }) {
  if (!drawState) {
    return null;
  }
  drawState.to = point;
  return drawState;
}

export function togglePosture() {
  if (!drawState) {
    return null;
  }
  drawState.posture =
    drawState.posture === "horizontal-first" ? "vertical-first" : "horizontal-first";
  return drawState.posture;
}

export function getPosture() {
  return drawState?.posture ?? null;
}

function buildWire(target: { blockId: string; portId: string }): Wire | null {
  if (!drawState) {
    return null;
  }
  const mid =
    drawState.posture === "horizontal-first"
      ? [drawState.to.x, drawState.from.y]
      : [drawState.from.x, drawState.to.y];
  const midX = mid[0] ?? drawState.to.x;
  const midY = mid[1] ?? drawState.to.y;
  return {
    id: `wire-${crypto.randomUUID()}`,
    from: { block: drawState.start.blockId, port: drawState.start.portId },
    to: { block: target.blockId, port: target.portId },
    waypoints: [
      [Math.round(drawState.from.x), Math.round(drawState.from.y)],
      [Math.round(midX), Math.round(midY)],
      [Math.round(drawState.to.x), Math.round(drawState.to.y)],
    ],
    pinned: false,
    net: null,
    kind: "signal",
  };
}

export function commitToPort(
  target: { blockId: string; portId: string },
  store: { transact: (name: string, fn: () => void) => void },
) {
  const wire = buildWire(target);
  if (!wire) {
    return null;
  }
  store.transact("draw wire", () => {});
  drawState = null;
  return wire;
}

export function commitToWire(
  existingWire: Wire,
  point: { x: number; y: number },
  store: { transact: (name: string, fn: () => void) => void },
) {
  if (!drawState) {
    return null;
  }
  store.transact("split wire", () => {});
  const junction = {
    blockId: `junction-${crypto.randomUUID()}`,
    x: Math.round(point.x),
    y: Math.round(point.y),
  };
  const newWires = [
    { ...existingWire, id: `${existingWire.id}-a` },
    { ...existingWire, id: `${existingWire.id}-b` },
  ];
  drawState = null;
  return { junction, newWires };
}

export function cancelDraw() {
  drawState = null;
}
