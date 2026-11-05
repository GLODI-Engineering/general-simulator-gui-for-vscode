import { useRef, useState } from "react";

import type { Primitive } from "../canvas/nodes/primitive-renderer";
import { PortCreateForm } from "./PortCreateForm";
import { SelectionOverlay } from "./SelectionOverlay";
import {
  type ResizeHandle,
  primitiveBBox,
  resizePrimitive,
  setPrimitiveRotation,
  toLocalDelta,
  translatePrimitive,
} from "./primitive-ops";
import { type PortSide, type SymbolPortDraft, useSymbolEditorStore } from "./store";

// FE-174/176: the actual drawing surface. Deliberately NOT the ReactFlow-
// based main Schematic canvas or AnnotationLayer.tsx (both operate in an
// infinite, pan/zoomable model space tied to useGraphStore) — a symbol's
// bbox is small (tens of units) and fixed, so a plain <svg viewBox="0 0 w
// h"> with the browser doing the pixel scaling is simpler and sufficient.
// Primitives are rendered as real SVG elements (not through
// primitive-renderer.ts's string-emitting renderPrimitives(), which has no
// per-element interactivity hooks) so each one can carry its own
// onPointerDown for the Select tool.

type DragMode = "draw" | "move" | "resize" | "rotate" | "movePort";

interface DragState {
  mode: DragMode;
  x0: number;
  y0: number;
  index?: number;
  original?: Primitive;
  handle?: ResizeHandle;
  centerX?: number;
  centerY?: number;
  startAngleDeg?: number;
  startRotation?: number;
  portKey?: number;
  originalPort?: SymbolPortDraft;
}

const PORT_MARKER_R = 1.4;
const PORT_STUB_LENGTH = 3.5;
// Room around the symbol's own bbox for port stubs/labels (see toModel()
// below for why the viewBox itself needs this, not just cosmetic padding).
const CANVAS_MARGIN = 10;

function buildDraft(
  tool: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Primitive | null {
  switch (tool) {
    case "line":
      return { type: "line", x1: x0, y1: y0, x2: x1, y2: y1 };
    case "rect":
      return {
        type: "rect",
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        w: Math.abs(x1 - x0),
        h: Math.abs(y1 - y0),
      };
    case "circle":
      return { type: "circle", cx: x0, cy: y0, r: Math.hypot(x1 - x0, y1 - y0) };
    default:
      return null;
  }
}

function nearestSide(
  x: number,
  y: number,
  w: number,
  h: number,
): { side: PortSide; offset: number } {
  const candidates: Array<[PortSide, number, number]> = [
    ["left", x, y],
    ["right", w - x, y],
    ["top", y, x],
    ["bottom", h - y, x],
  ];
  const best = candidates.reduce((closest, current) =>
    current[1] < closest[1] ? current : closest,
  );
  return { side: best[0], offset: Math.round(best[2]) };
}

/** Mirrors gsim_model.layout's side/offset -> position convention (and
 * port-hit-test.ts's basePortCenter): left/right vary along y, top/bottom
 * vary along x. */
function portCenter(port: SymbolPortDraft, bboxW: number, bboxH: number): [number, number] {
  switch (port.side) {
    case "left":
      return [0, port.offset];
    case "right":
      return [bboxW, port.offset];
    case "top":
      return [port.offset, 0];
    case "bottom":
      return [port.offset, bboxH];
  }
}

const EXIT_DIRECTION: Record<PortSide, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  top: [0, -1],
  bottom: [0, 1],
};

function ShapeElement({
  primitive,
  selected,
  onPointerDown,
}: {
  primitive: Primitive;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  const stroke = selected ? "#2563eb" : "#0f172a";
  const strokeWidth =
    primitive.type === "text" || primitive.type === "rectf" ? undefined : (primitive.lw ?? 1.2);
  const rotation = "rotation" in primitive ? primitive.rotation : undefined;

  switch (primitive.type) {
    case "line":
      return (
        <line
          x1={primitive.x1}
          y1={primitive.y1}
          x2={primitive.x2}
          y2={primitive.y2}
          stroke={stroke}
          strokeWidth={strokeWidth}
          onPointerDown={onPointerDown}
        />
      );
    case "rect":
      return (
        <rect
          x={primitive.x}
          y={primitive.y}
          width={primitive.w}
          height={primitive.h}
          fill={primitive.filled ? stroke : "none"}
          stroke={stroke}
          strokeWidth={strokeWidth}
          transform={
            rotation
              ? `rotate(${rotation} ${primitive.x + primitive.w / 2} ${primitive.y + primitive.h / 2})`
              : undefined
          }
          onPointerDown={onPointerDown}
        />
      );
    case "rectf":
      return (
        <rect
          x={primitive.x}
          y={primitive.y}
          width={primitive.w}
          height={primitive.h}
          fill={stroke}
          transform={
            rotation
              ? `rotate(${rotation} ${primitive.x + primitive.w / 2} ${primitive.y + primitive.h / 2})`
              : undefined
          }
          onPointerDown={onPointerDown}
        />
      );
    case "circle":
      return (
        <circle
          cx={primitive.cx}
          cy={primitive.cy}
          r={primitive.r}
          fill={primitive.filled ? stroke : "none"}
          stroke={stroke}
          strokeWidth={strokeWidth}
          onPointerDown={onPointerDown}
        />
      );
    case "arc": {
      const x1 = primitive.cx + primitive.r * Math.cos(primitive.a0);
      const y1 = primitive.cy + primitive.r * Math.sin(primitive.a0);
      const x2 = primitive.cx + primitive.r * Math.cos(primitive.a1);
      const y2 = primitive.cy + primitive.r * Math.sin(primitive.a1);
      const large = Math.abs(primitive.a1 - primitive.a0) > Math.PI ? 1 : 0;
      return (
        <path
          d={`M ${x1} ${y1} A ${primitive.r} ${primitive.r} 0 ${large} 1 ${x2} ${y2}`}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          onPointerDown={onPointerDown}
        />
      );
    }
    case "polygon":
      return (
        <polygon
          points={primitive.pts.map((p) => p.join(",")).join(" ")}
          fill={primitive.filled ? stroke : "none"}
          stroke={stroke}
          strokeWidth={strokeWidth}
          onPointerDown={onPointerDown}
        />
      );
    case "polyline":
      return (
        <polyline
          points={primitive.pts.map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          onPointerDown={onPointerDown}
        />
      );
    case "text":
      return (
        <text
          x={primitive.x}
          y={primitive.y}
          fontSize={primitive.size ?? 8}
          textAnchor={
            primitive.align === "end" ? "end" : primitive.align === "center" ? "middle" : "start"
          }
          fill={stroke}
          transform={rotation ? `rotate(${rotation} ${primitive.x} ${primitive.y})` : undefined}
          onPointerDown={onPointerDown}
        >
          {primitive.text}
        </text>
      );
  }
}

function PortMarker({
  port,
  bboxW,
  bboxH,
  selected,
  onPointerDown,
}: {
  port: SymbolPortDraft;
  bboxW: number;
  bboxH: number;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
}) {
  const [cx, cy] = portCenter(port, bboxW, bboxH);
  const [dx, dy] = EXIT_DIRECTION[port.side];
  const stroke = selected ? "#2563eb" : "#b45309";
  return (
    <g onPointerDown={onPointerDown} cursor="pointer">
      <line
        x1={cx}
        y1={cy}
        x2={cx + dx * PORT_STUB_LENGTH}
        y2={cy + dy * PORT_STUB_LENGTH}
        stroke={stroke}
        strokeWidth={0.8}
      />
      <circle cx={cx} cy={cy} r={PORT_MARKER_R} fill={stroke} />
      <text
        x={cx + dx * (PORT_STUB_LENGTH + 1.5)}
        y={cy + dy * (PORT_STUB_LENGTH + 1.5)}
        fontSize={3}
        fill={stroke}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {port.label || port.id}
      </text>
    </g>
  );
}

export function SymbolEditorCanvas() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [draft, setDraft] = useState<Primitive | null>(null);
  const [pendingPort, setPendingPort] = useState<{ side: PortSide; offset: number } | null>(null);

  const tool = useSymbolEditorStore((s) => s.tool);
  const bboxW = useSymbolEditorStore((s) => s.bboxW);
  const bboxH = useSymbolEditorStore((s) => s.bboxH);
  const primitives = useSymbolEditorStore((s) => s.primitives);
  const selectedIndex = useSymbolEditorStore((s) => s.selectedIndex);
  const ports = useSymbolEditorStore((s) => s.ports);
  const selectedPortKey = useSymbolEditorStore((s) => s.selectedPortKey);

  // The canvas fills its wrapper (see layout.css) rather than being sized
  // to bboxW*bboxH*SCALE, so the SVG's own box and its viewBox (model
  // space) generally have different aspect ratios.
  // preserveAspectRatio="xMidYMid meet" (the default) letterboxes the
  // drawing within the element's box instead of stretching it — clicks in
  // the letterbox margins must not map outside the model. Replicates that
  // same "meet" math here rather than assuming rect == content area.
  //
  // The viewBox itself is padded by CANVAS_MARGIN beyond the symbol's own
  // bbox — ports live exactly AT the bbox edge and their stubs/labels
  // extend outward from it (PortMarker), which an exact "0 0 w h" viewBox
  // would clip at the SVG viewport boundary. toModel() must subtract the
  // same margin back out.
  function toModel(event: { clientX: number; clientY: number }): [number, number] {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return [0, 0];
    const viewW = bboxW + CANVAS_MARGIN * 2;
    const viewH = bboxH + CANVAS_MARGIN * 2;
    const scale = Math.min(rect.width / viewW, rect.height / viewH);
    const contentWidth = viewW * scale;
    const contentHeight = viewH * scale;
    const offsetX = (rect.width - contentWidth) / 2;
    const offsetY = (rect.height - contentHeight) / 2;
    const x = (event.clientX - rect.left - offsetX) / scale - CANVAS_MARGIN;
    const y = (event.clientY - rect.top - offsetY) / scale - CANVAS_MARGIN;
    return [Math.round(x), Math.round(y)];
  }

  function handleSvgPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (tool === "select") {
      useSymbolEditorStore.getState().select(null);
      return;
    }
    const [x, y] = toModel(event);

    if (tool === "text") {
      // MVP text-entry via window.prompt(); a proper inline editor is a
      // follow-up, not core to placing a text primitive.
      const text = window.prompt("Text:", "Label");
      if (text) {
        useSymbolEditorStore.getState().addPrimitive({ type: "text", x, y, text, size: 8 });
      }
      return;
    }

    if (tool === "port") {
      const { side, offset } = nearestSide(x, y, bboxW, bboxH);
      setPendingPort({ side, offset });
      return;
    }

    dragRef.current = { mode: "draw", x0: x, y0: y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSvgPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const [x, y] = toModel(event);
    const dx = x - drag.x0;
    const dy = y - drag.y0;

    if (drag.mode === "draw") {
      setDraft(buildDraft(tool, drag.x0, drag.y0, x, y));
      return;
    }
    if (drag.mode === "move" && drag.index !== undefined && drag.original) {
      useSymbolEditorStore
        .getState()
        .updatePrimitive(drag.index, translatePrimitive(drag.original, dx, dy));
      return;
    }
    if (drag.mode === "resize" && drag.index !== undefined && drag.original && drag.handle) {
      const rotation = "rotation" in drag.original ? (drag.original.rotation ?? 0) : 0;
      const [localDx, localDy] = toLocalDelta(dx, dy, rotation);
      useSymbolEditorStore
        .getState()
        .updatePrimitive(drag.index, resizePrimitive(drag.original, drag.handle, localDx, localDy));
      return;
    }
    if (
      drag.mode === "rotate" &&
      drag.index !== undefined &&
      drag.original &&
      drag.centerX !== undefined &&
      drag.centerY !== undefined &&
      drag.startAngleDeg !== undefined &&
      drag.startRotation !== undefined
    ) {
      const currentAngleDeg = (Math.atan2(y - drag.centerY, x - drag.centerX) * 180) / Math.PI;
      const rotation = Math.round(drag.startRotation + (currentAngleDeg - drag.startAngleDeg));
      useSymbolEditorStore
        .getState()
        .updatePrimitive(drag.index, setPrimitiveRotation(drag.original, rotation));
      return;
    }
    if (drag.mode === "movePort" && drag.portKey !== undefined && drag.originalPort) {
      const side = drag.originalPort.side;
      const along = side === "left" || side === "right" ? y - drag.y0 : x - drag.x0;
      const max = side === "left" || side === "right" ? bboxH : bboxW;
      const offset = Math.max(0, Math.min(max, Math.round(drag.originalPort.offset + along)));
      useSymbolEditorStore.getState().updatePort(drag.portKey, { offset });
    }
  }

  function handleSvgPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.mode === "draw" && draft) {
      useSymbolEditorStore.getState().addPrimitive(draft);
    }
    setDraft(null);
  }

  function handleShapePointerDown(index: number, event: React.PointerEvent) {
    if (tool !== "select") return;
    event.stopPropagation();
    const store = useSymbolEditorStore.getState();
    store.select(index);
    const [x, y] = toModel(event);
    dragRef.current = { mode: "move", x0: x, y0: y, index, original: store.primitives[index] };
  }

  function handleResizeHandlePointerDown(
    index: number,
    handle: ResizeHandle,
    event: React.PointerEvent,
  ) {
    event.stopPropagation();
    const [x, y] = toModel(event);
    const original = useSymbolEditorStore.getState().primitives[index];
    if (!original) return;
    dragRef.current = { mode: "resize", x0: x, y0: y, index, original, handle };
  }

  function handleRotateHandlePointerDown(index: number, event: React.PointerEvent) {
    event.stopPropagation();
    const [x, y] = toModel(event);
    const original = useSymbolEditorStore.getState().primitives[index];
    if (!original) return;
    const bbox = primitiveBBox(original);
    const centerX = bbox.x + bbox.w / 2;
    const centerY = bbox.y + bbox.h / 2;
    const startAngleDeg = (Math.atan2(y - centerY, x - centerX) * 180) / Math.PI;
    const startRotation = "rotation" in original ? (original.rotation ?? 0) : 0;
    dragRef.current = {
      mode: "rotate",
      x0: x,
      y0: y,
      index,
      original,
      centerX,
      centerY,
      startAngleDeg,
      startRotation,
    };
  }

  function handlePortPointerDown(port: SymbolPortDraft, event: React.PointerEvent) {
    if (tool !== "select") return;
    event.stopPropagation();
    const store = useSymbolEditorStore.getState();
    store.selectPort(port.key);
    const [x, y] = toModel(event);
    dragRef.current = { mode: "movePort", x0: x, y0: y, portKey: port.key, originalPort: port };
  }

  const primitiveElements = primitives.map((primitive, index) => (
    <ShapeElement
      // biome-ignore lint/suspicious/noArrayIndexKey: primitives have no stable id of their own; no reordering UI exists yet.
      key={index}
      primitive={primitive}
      selected={index === selectedIndex}
      onPointerDown={(event) => handleShapePointerDown(index, event)}
    />
  ));

  const selectedPrimitive =
    selectedIndex !== null && tool === "select" ? primitives[selectedIndex] : undefined;

  return (
    <div className="symbol-editor__canvas-wrap">
      <svg
        ref={svgRef}
        className="symbol-editor__canvas"
        viewBox={`${-CANVAS_MARGIN} ${-CANVAS_MARGIN} ${bboxW + CANVAS_MARGIN * 2} ${bboxH + CANVAS_MARGIN * 2}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={handleSvgPointerUp}
        role="img"
        aria-label="Symbol drawing canvas"
      >
        <rect
          x={0}
          y={0}
          width={bboxW}
          height={bboxH}
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeDasharray="2 2"
        />
        {primitiveElements}
        {ports.map((port) => (
          <PortMarker
            key={port.key}
            port={port}
            bboxW={bboxW}
            bboxH={bboxH}
            selected={port.key === selectedPortKey}
            onPointerDown={(event) => handlePortPointerDown(port, event)}
          />
        ))}
        {draft ? (
          <ShapeElement primitive={draft} selected={false} onPointerDown={() => {}} />
        ) : null}
        {selectedPrimitive && selectedIndex !== null ? (
          <SelectionOverlay
            primitive={selectedPrimitive}
            onHandlePointerDown={(handle, event) =>
              handleResizeHandlePointerDown(selectedIndex, handle, event)
            }
            onRotateHandlePointerDown={(event) =>
              handleRotateHandlePointerDown(selectedIndex, event)
            }
          />
        ) : null}
      </svg>
      {pendingPort ? (
        <PortCreateForm
          initialSide={pendingPort.side}
          initialOffset={pendingPort.offset}
          onConfirm={(port) => {
            useSymbolEditorStore.getState().addPort(port);
            setPendingPort(null);
          }}
          onCancel={() => setPendingPort(null)}
        />
      ) : null}
    </div>
  );
}

export default SymbolEditorCanvas;
