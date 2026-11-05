import type { Primitive } from "../canvas/nodes/primitive-renderer";
import { type ResizeHandle, primitiveBBox, supportsRotation } from "./primitive-ops";

const HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const HANDLE_POSITION: Record<
  ResizeHandle,
  (bbox: { x: number; y: number; w: number; h: number }) => [number, number]
> = {
  nw: (b) => [b.x, b.y],
  n: (b) => [b.x + b.w / 2, b.y],
  ne: (b) => [b.x + b.w, b.y],
  e: (b) => [b.x + b.w, b.y + b.h / 2],
  se: (b) => [b.x + b.w, b.y + b.h],
  s: (b) => [b.x + b.w / 2, b.y + b.h],
  sw: (b) => [b.x, b.y + b.h],
  w: (b) => [b.x, b.y + b.h / 2],
};

const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

export interface SelectionOverlayProps {
  primitive: Primitive;
  onHandlePointerDown: (handle: ResizeHandle, event: React.PointerEvent) => void;
  onRotateHandlePointerDown: (event: React.PointerEvent) => void;
}

/** Bounding box + 8 resize handles + a rotate handle, drawn in the
 * primitive's own local frame and wrapped in the SAME rotate() transform
 * the shape itself renders with — so the whole overlay spins together
 * with an already-rotated shape instead of staying axis-aligned to the
 * screen. */
export function SelectionOverlay({
  primitive,
  onHandlePointerDown,
  onRotateHandlePointerDown,
}: SelectionOverlayProps) {
  const bbox = primitiveBBox(primitive);
  const rotation = "rotation" in primitive ? (primitive.rotation ?? 0) : 0;
  const centerX = bbox.x + bbox.w / 2;
  const centerY = bbox.y + bbox.h / 2;
  const canRotate = supportsRotation(primitive);
  const rotateHandleY = bbox.y - Math.max(6, bbox.h * 0.35);

  const handleSize = Math.max(1.5, Math.min(bbox.w, bbox.h) * 0.12);

  return (
    <g
      className="symbol-editor__selection-overlay"
      transform={rotation ? `rotate(${rotation} ${centerX} ${centerY})` : undefined}
    >
      <rect
        x={bbox.x}
        y={bbox.y}
        width={bbox.w}
        height={bbox.h}
        fill="none"
        stroke="#2563eb"
        strokeDasharray="2 1.5"
        strokeWidth={0.6}
        pointerEvents="none"
      />
      {canRotate ? (
        <>
          <line
            x1={centerX}
            y1={bbox.y}
            x2={centerX}
            y2={rotateHandleY}
            stroke="#2563eb"
            strokeWidth={0.6}
            pointerEvents="none"
          />
          <circle
            cx={centerX}
            cy={rotateHandleY}
            r={handleSize * 0.8}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={0.8}
            cursor="grab"
            onPointerDown={onRotateHandlePointerDown}
          />
        </>
      ) : null}
      {HANDLES.map((handle) => {
        const [hx, hy] = HANDLE_POSITION[handle](bbox);
        return (
          <rect
            key={handle}
            x={hx - handleSize / 2}
            y={hy - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={0.6}
            cursor={HANDLE_CURSOR[handle]}
            onPointerDown={(event) => onHandlePointerDown(handle, event)}
          />
        );
      })}
    </g>
  );
}

export default SelectionOverlay;
