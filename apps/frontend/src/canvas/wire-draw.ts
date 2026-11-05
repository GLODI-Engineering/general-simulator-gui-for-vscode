import { type CompatResult, type PortDesc, canConnect } from "./port-compat";

type Point = { x: number; y: number };

type PortRef = {
  blockId: string;
  portId: string;
  kind: string;
  direction?: "in" | "out" | "inout";
};

type HoverTarget = {
  blockId: string;
  portId: string;
  port: { kind: string; direction?: "in" | "out" | "inout"; driven?: boolean };
};

type DrawState = {
  from: PortRef;
  start: Point;
  cursor: Point;
  hover: HoverTarget | null;
  compat: CompatResult;
};

let state: DrawState | null = null;

export function startDraw(from: PortRef, start: Point): void {
  state = { from, start, cursor: start, hover: null, compat: { ok: true } };
}

export function moveDraw(cursor: Point, hover?: HoverTarget): void {
  if (!state) return;
  state.cursor = cursor;
  state.hover = hover ?? null;
  if (hover) {
    const src: PortDesc = { kind: state.from.kind, direction: state.from.direction };
    const dst: PortDesc = {
      kind: hover.port.kind,
      direction: hover.port.direction,
      driven: hover.port.driven,
    };
    state.compat = canConnect(src, dst);
  } else {
    state.compat = { ok: true };
  }
}

export function getHoverState(): { compat: CompatResult; hover: HoverTarget | null } {
  return { compat: state?.compat ?? { ok: true }, hover: state?.hover ?? null };
}

export function isDrawing(): boolean {
  return state !== null;
}

export function cancelDraw(): void {
  state = null;
}

export function commitToPort(
  target: { blockId: string; portId: string },
  targetPort: { kind: string; direction?: "in" | "out" | "inout"; driven?: boolean },
  store: { transact: (name: string, fn: () => void) => void },
): { ok: true } | { ok: false; reason: string } {
  if (!state) return { ok: false, reason: "not-drawing" };

  const compat = canConnect(
    { kind: state.from.kind, direction: state.from.direction },
    { kind: targetPort.kind, direction: targetPort.direction, driven: targetPort.driven },
  );

  if (!compat.ok) {
    return { ok: false, reason: compat.reason };
  }

  store.transact("draw wire", () => {
    void target;
  });
  state = null;
  return { ok: true };
}
