let dragState: {
  ids: string[];
  origin: { x: number; y: number };
  pointer: { x: number; y: number };
  axisLock: "x" | "y" | null;
} | null = null;

export function startDrag(ids: string[], origin: { x: number; y: number }) {
  dragState = { ids, origin, pointer: origin, axisLock: null };
}

export function moveDrag(pointer: { x: number; y: number }) {
  if (!dragState) {
    return null;
  }
  dragState.pointer = pointer;
  return dragState;
}

export function enableAxisLock() {
  if (!dragState) {
    return;
  }
  const dx = Math.abs(dragState.pointer.x - dragState.origin.x);
  const dy = Math.abs(dragState.pointer.y - dragState.origin.y);
  dragState.axisLock = dx >= dy ? "x" : "y";
}

export function getPreview() {
  if (!dragState) {
    return null;
  }
  const dx = dragState.pointer.x - dragState.origin.x;
  const dy = dragState.pointer.y - dragState.origin.y;
  return dragState.ids.map((id) => ({
    id,
    position:
      dragState?.axisLock === "x" ? [dx, 0] : dragState?.axisLock === "y" ? [0, dy] : [dx, dy],
  }));
}

export function commitDrag(
  store: { transact: (name: string, fn: () => void) => void },
  apply?: () => void,
) {
  if (!dragState) {
    return null;
  }
  const snapshot = dragState;
  // Block move and attached-wire stretch are applied inside one transact so a
  // single undo restores both (FE-99).
  store.transact("drag", () => {
    apply?.();
  });
  dragState = null;
  return snapshot;
}

export function cancelDrag() {
  dragState = null;
}
