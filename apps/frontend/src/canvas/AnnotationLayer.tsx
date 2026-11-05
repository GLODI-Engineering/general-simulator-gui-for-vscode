/**
 * FE-59: AnnotationLayer — renders model.lines[] as an SVG layer between the
 * grid background and the block layer.  Supports drawing new annotations via
 * the active annotation tool, selecting, dragging, and double-click text
 * editing.
 *
 * Z-order: grid (bottom) → AnnotationLayer → ReactFlow blocks (top).
 */

import { useCallback, useRef, useState } from "react";
import type { Annotation } from "../model/types";
import { useGraphStore, useUiStore } from "../store";
import type { AnnotationTool } from "../store/ui";
import {
  createEllipse,
  createPolyline,
  createRectangle,
  createText,
  snapPoint,
  toModelAnnotation,
} from "./annotation-tools";
import { toModel, toScreen } from "./coords";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function screenToModelSnapped(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  panX: number,
  panY: number,
  zoom: number,
  grid: number,
): [number, number] {
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const model = toModel({ x: sx, y: sy }, { zoom, panX, panY });
  return snapPoint(model.x, model.y, grid);
}

function modelToSvg(
  mx: number,
  my: number,
  panX: number,
  panY: number,
  zoom: number,
): { x: number; y: number } {
  return toScreen({ x: mx, y: my }, { zoom, panX, panY });
}

// ─── Annotation rendering helpers ────────────────────────────────────────────

function strokeDashArray(style: Record<string, unknown> | undefined): string | undefined {
  const s = style?.stroke_style;
  if (s === "dashed") return "6,3";
  if (s === "dotted") return "2,3";
  return undefined;
}

function renderAnnotation(
  ann: Annotation,
  panX: number,
  panY: number,
  zoom: number,
  isSelected: boolean,
  isEditing: boolean,
  onPointerDown: (e: React.PointerEvent) => void,
  onDoubleClick: (e: React.MouseEvent) => void,
  editText: string,
  onEditTextChange: (v: string) => void,
  onEditCommit: () => void,
): React.ReactNode {
  const style = ann.style as Record<string, unknown> | undefined;
  const stroke = (style?.color as string | undefined) ?? "#000000";
  const fill = (style?.fill as string | undefined) ?? "none";
  const strokeWidth = (style?.stroke_width as number | undefined) ?? 1;
  const dashArray = strokeDashArray(style);
  const selected = isSelected ? "annotation--selected" : "";

  switch (ann.kind) {
    case "text": {
      if (!ann.position) return null;
      const { x, y } = modelToSvg(ann.position[0], ann.position[1], panX, panY, zoom);
      const fontSize = (style?.font_size as number | undefined) ?? 18;
      const fontWeight = style?.bold ? "bold" : "normal";
      const fontStyle = style?.italic ? "italic" : "normal";
      const color = (style?.color as string | undefined) ?? "#000000";

      if (isEditing) {
        return (
          <foreignObject key={ann.id} x={x} y={y - fontSize} width={200} height={fontSize * 2 + 8}>
            <input
              // biome-ignore lint/a11y/noAutofocus: editing mode requires focus
              autoFocus
              style={{
                fontSize,
                fontWeight,
                fontStyle,
                color,
                border: "1px solid #666",
                width: "100%",
              }}
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              onBlur={onEditCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") onEditCommit();
              }}
            />
          </foreignObject>
        );
      }

      return (
        <text
          key={ann.id}
          className={`annotation annotation--text ${selected}`}
          x={x}
          y={y}
          fontSize={fontSize}
          fontWeight={fontWeight}
          fontStyle={fontStyle}
          fill={color}
          data-annotation-id={ann.id}
          data-font-size={fontSize}
          style={{ cursor: "move", userSelect: "none" }}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
        >
          {ann.text ?? ""}
        </text>
      );
    }

    case "polyline": {
      if (!ann.points || ann.points.length < 2) return null;
      const screenPts = ann.points
        .map((p) => {
          const s = modelToSvg(p[0], p[1], panX, panY, zoom);
          return `${s.x},${s.y}`;
        })
        .join(" ");

      const arrowEnd = style?.arrow_end as string | undefined;
      const markerId = `arrow-${ann.id}`;

      return (
        <g key={ann.id}>
          {arrowEnd && arrowEnd !== "none" ? (
            <defs>
              <marker
                id={markerId}
                markerWidth="8"
                markerHeight="8"
                refX="4"
                refY="3"
                orient="auto"
              >
                {arrowEnd === "filled" ? (
                  <path d="M0,0 L0,6 L8,3 z" fill={stroke} />
                ) : (
                  <path d="M0,0 L8,3 L0,6" fill="none" stroke={stroke} strokeWidth="1" />
                )}
              </marker>
            </defs>
          ) : null}
          <polyline
            className={`annotation annotation--polyline ${selected}`}
            points={screenPts}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            fill="none"
            markerEnd={arrowEnd && arrowEnd !== "none" ? `url(#${markerId})` : undefined}
            data-annotation-id={ann.id}
            style={{ cursor: "move" }}
            onPointerDown={onPointerDown}
            onDoubleClick={onDoubleClick}
          />
        </g>
      );
    }

    case "rectangle": {
      if (!ann.position || !ann.size) return null;
      const { x, y } = modelToSvg(ann.position[0], ann.position[1], panX, panY, zoom);
      const w = ann.size[0] * zoom;
      const h = ann.size[1] * zoom;

      return (
        <rect
          key={ann.id}
          className={`annotation annotation--rectangle ${selected}`}
          x={Math.min(x, x + w)}
          y={Math.min(y, y + h)}
          width={Math.abs(w)}
          height={Math.abs(h)}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          fill={fill}
          data-annotation-id={ann.id}
          style={{ cursor: "move" }}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
        />
      );
    }

    case "ellipse": {
      if (!ann.position || !ann.size) return null;
      const { x: cx, y: cy } = modelToSvg(ann.position[0], ann.position[1], panX, panY, zoom);
      const rx = Math.abs(ann.size[0] * zoom);
      const ry = Math.abs(ann.size[1] * zoom);

      return (
        <ellipse
          key={ann.id}
          className={`annotation annotation--ellipse ${selected}`}
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          fill={fill}
          data-annotation-id={ann.id}
          style={{ cursor: "move" }}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
        />
      );
    }

    default:
      return null;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface AnnotationLayerProps {
  width: number;
  height: number;
}

interface DragState {
  annotationId: string;
  /** Position when the drag started — immutable, used to compute the total
   * delta committed to the store once, on pointerup. */
  originPosition: [number, number];
  /** Last mouse model position — used to compute the incremental delta
   * applied to livePosition on each move. */
  lastModelX: number;
  lastModelY: number;
  /** Current on-screen preview position, updated every pointermove. Purely
   * local/visual — never touches the graph store until the drag ends, so
   * dragging stays smooth regardless of document size (see FE-142). */
  livePosition: [number, number];
}

interface DrawState {
  kind: AnnotationTool;
  // For polyline: accumulated points
  points: Array<[number, number]>;
  // For rect/ellipse: start point
  startX: number;
  startY: number;
  // Current cursor position in model coords
  curX: number;
  curY: number;
}

export function AnnotationLayer({ width, height }: AnnotationLayerProps) {
  const lines = useGraphStore((state) => state.document.model.lines ?? []);
  const grid = useGraphStore((state) => state.document.model.grid);
  const addAnnotation = useGraphStore((state) => state.addAnnotation);
  const updateAnnotation = useGraphStore((state) => state.updateAnnotation);
  const moveAnnotation = useGraphStore((state) => state.moveAnnotation);
  const transact = useGraphStore((state) => state.transact);
  const zoom = useUiStore((state) => state.zoom);
  const pan = useUiStore((state) => state.pan);
  const annotationTool = useUiStore((state) => state.annotationTool);
  const setAnnotationTool = useUiStore((state) => state.setAnnotationTool);
  const selection = useUiStore((state) => state.selection);
  const setSelection = useUiStore((state) => state.setSelection);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");

  const getSvgRect = useCallback((): DOMRect | null => {
    return svgRef.current?.getBoundingClientRect() ?? null;
  }, []);

  // ── Text editing ──────────────────────────────────────────────────────────

  const commitTextEdit = useCallback(() => {
    if (!editingId) return;
    transact("edit annotation text", () => {
      updateAnnotation(editingId, { text: editText });
    });
    setEditingId(null);
    setEditText("");
  }, [editingId, editText, transact, updateAnnotation]);

  // ── Annotation drawing ────────────────────────────────────────────────────

  const handleSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!annotationTool) return;
      const rect = getSvgRect();
      if (!rect) return;
      const [mx, my] = screenToModelSnapped(e.clientX, e.clientY, rect, pan.x, pan.y, zoom, grid);

      if (annotationTool === "text") {
        const data = createText([mx, my]);
        const ann = toModelAnnotation(data);
        transact("add annotation", () => {
          addAnnotation(ann);
        });
        // Immediately enter edit mode
        setEditingId(ann.id);
        setEditText("");
        setAnnotationTool(null);
        return;
      }

      if (annotationTool === "polyline") {
        if (!drawState) {
          setDrawState({
            kind: "polyline",
            points: [[mx, my]],
            startX: mx,
            startY: my,
            curX: mx,
            curY: my,
          });
        } else {
          setDrawState((prev) =>
            prev ? { ...prev, points: [...prev.points, [mx, my]], curX: mx, curY: my } : null,
          );
        }
      }
    },
    [
      annotationTool,
      drawState,
      getSvgRect,
      pan,
      zoom,
      grid,
      addAnnotation,
      transact,
      setAnnotationTool,
    ],
  );

  const handleSvgDoubleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (annotationTool === "polyline" && drawState && drawState.points.length >= 2) {
        e.preventDefault();
        const data = createPolyline(drawState.points);
        const ann = toModelAnnotation(data);
        transact("add polyline annotation", () => {
          addAnnotation(ann);
        });
        setDrawState(null);
        setAnnotationTool(null);
      }
    },
    [annotationTool, drawState, addAnnotation, transact, setAnnotationTool],
  );

  const handleSvgMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (annotationTool === "rectangle" || annotationTool === "ellipse") {
        const rect = getSvgRect();
        if (!rect) return;
        const [mx, my] = screenToModelSnapped(e.clientX, e.clientY, rect, pan.x, pan.y, zoom, grid);
        setDrawState({
          kind: annotationTool,
          points: [],
          startX: mx,
          startY: my,
          curX: mx,
          curY: my,
        });
      }
    },
    [annotationTool, getSvgRect, pan, zoom, grid],
  );

  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!drawState) return;
      const rect = getSvgRect();
      if (!rect) return;
      const [mx, my] = screenToModelSnapped(e.clientX, e.clientY, rect, pan.x, pan.y, zoom, grid);
      setDrawState((prev) => (prev ? { ...prev, curX: mx, curY: my } : null));
    },
    [drawState, getSvgRect, pan, zoom, grid],
  );

  const handleSvgMouseUp = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!drawState) return;
      if (drawState.kind !== "rectangle" && drawState.kind !== "ellipse") return;

      const rect = getSvgRect();
      if (!rect) return;
      const [mx, my] = screenToModelSnapped(e.clientX, e.clientY, rect, pan.x, pan.y, zoom, grid);

      const dx = mx - drawState.startX;
      const dy = my - drawState.startY;
      if (dx === 0 && dy === 0) {
        setDrawState(null);
        return;
      }

      let ann: Annotation;
      if (drawState.kind === "rectangle") {
        const origin: [number, number] = [
          Math.min(drawState.startX, mx),
          Math.min(drawState.startY, my),
        ];
        const size: [number, number] = [Math.abs(dx), Math.abs(dy)];
        ann = toModelAnnotation(createRectangle(origin, size));
      } else {
        const center: [number, number] = [
          (drawState.startX + mx) >> 1,
          (drawState.startY + my) >> 1,
        ];
        const radii: [number, number] = [Math.abs(dx) >> 1, Math.abs(dy) >> 1];
        ann = toModelAnnotation(createEllipse(center, radii));
      }

      transact(`add ${drawState.kind} annotation`, () => {
        addAnnotation(ann);
      });
      setDrawState(null);
      setAnnotationTool(null);
    },
    [drawState, getSvgRect, pan, zoom, grid, addAnnotation, transact, setAnnotationTool],
  );

  // ── Annotation dragging ───────────────────────────────────────────────────
  //
  // FE-142: dragging used to call transact()+moveAnnotation() — which does
  // up to 5 full structuredClone passes over the *entire* document, for
  // undo-snapshotting — on every single pointermove. On a non-trivial
  // schematic that's expensive enough to visibly stall the drag until the
  // browser catches up at pointerup, looking exactly like "doesn't move
  // until I release the mouse". Blocks (ReactFlow nodes) never had this
  // problem because dragging them only ever touches local `flowNodes`
  // state (see Canvas.tsx's handleNodesChange/onNodeDragStop) — the graph
  // store is written to ONCE, at drag end. Annotations now follow the same
  // pattern: `dragState.livePosition` drives rendering during the drag
  // (cheap plain-object state, no store/clone involved), and a single
  // moveAnnotation() call commits the total delta on pointerup.
  //
  // The live anchor is also mirrored into a ref so handlePointerMove/
  // handlePointerUp don't need `dragState` in their own dependency arrays
  // — keeping their identity stable across the whole drag, so
  // onPointerMove={handlePointerMove} doesn't detach/reattach the native
  // listener on every move (a second, independent bug this also fixes).
  const dragStateRef = useRef<DragState | null>(null);

  const handleAnnotationPointerDown = useCallback(
    (e: React.PointerEvent, annId: string) => {
      if (annotationTool) return; // drawing mode takes priority
      e.stopPropagation();
      setSelection([annId]);
      const rect = getSvgRect();
      if (!rect) return;
      const [mx, my] = screenToModelSnapped(e.clientX, e.clientY, rect, pan.x, pan.y, zoom, grid);
      const ann = lines.find((candidate) => candidate.id === annId);
      const originPosition: [number, number] = ann?.position ?? [mx, my];
      const next: DragState = {
        annotationId: annId,
        originPosition,
        lastModelX: mx,
        lastModelY: my,
        livePosition: originPosition,
      };
      dragStateRef.current = next;
      setDragState(next);
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    },
    [annotationTool, getSvgRect, pan, zoom, grid, setSelection, lines],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const current = dragStateRef.current;
      if (!current) return;
      const rect = getSvgRect();
      if (!rect) return;
      const [mx, my] = screenToModelSnapped(e.clientX, e.clientY, rect, pan.x, pan.y, zoom, grid);
      const dx = mx - current.lastModelX;
      const dy = my - current.lastModelY;
      if (dx === 0 && dy === 0) return;
      const next: DragState = {
        ...current,
        lastModelX: mx,
        lastModelY: my,
        livePosition: [current.livePosition[0] + dx, current.livePosition[1] + dy],
      };
      dragStateRef.current = next;
      setDragState(next);
    },
    [getSvgRect, pan, zoom, grid],
  );

  const handlePointerUp = useCallback(() => {
    const current = dragStateRef.current;
    dragStateRef.current = null;
    setDragState(null);
    if (!current) return;
    const delta: [number, number] = [
      current.livePosition[0] - current.originPosition[0],
      current.livePosition[1] - current.originPosition[1],
    ];
    if (delta[0] === 0 && delta[1] === 0) return;
    transact("move annotation", () => {
      moveAnnotation(current.annotationId, delta);
    });
  }, [transact, moveAnnotation]);

  // ── Escape to cancel tool ─────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      if (e.key === "Escape") {
        setDrawState(null);
        setAnnotationTool(null);
      }
    },
    [setAnnotationTool],
  );

  // ── Ghost preview while drawing ───────────────────────────────────────────

  function renderGhost(): React.ReactNode {
    if (!drawState) return null;

    if (drawState.kind === "polyline" && drawState.points.length > 0) {
      const allPts = [...drawState.points, [drawState.curX, drawState.curY] as [number, number]];
      const screenPts = allPts
        .map((p) => {
          const s = modelToSvg(p[0], p[1], pan.x, pan.y, zoom);
          return `${s.x},${s.y}`;
        })
        .join(" ");
      return (
        <polyline
          points={screenPts}
          stroke="#4a90d9"
          strokeWidth={1}
          strokeDasharray="4,2"
          fill="none"
          pointerEvents="none"
        />
      );
    }

    if (drawState.kind === "rectangle") {
      const x1 = drawState.startX;
      const y1 = drawState.startY;
      const x2 = drawState.curX;
      const y2 = drawState.curY;
      const s1 = modelToSvg(Math.min(x1, x2), Math.min(y1, y2), pan.x, pan.y, zoom);
      const w = Math.abs(x2 - x1) * zoom;
      const h = Math.abs(y2 - y1) * zoom;
      return (
        <rect
          x={s1.x}
          y={s1.y}
          width={w}
          height={h}
          stroke="#4a90d9"
          strokeWidth={1}
          strokeDasharray="4,2"
          fill="rgba(74,144,217,0.1)"
          pointerEvents="none"
        />
      );
    }

    if (drawState.kind === "ellipse") {
      const dx = drawState.curX - drawState.startX;
      const dy = drawState.curY - drawState.startY;
      const cx = (drawState.startX + drawState.curX) / 2;
      const cy = (drawState.startY + drawState.curY) / 2;
      const sc = modelToSvg(cx, cy, pan.x, pan.y, zoom);
      const rx = Math.abs(dx / 2) * zoom;
      const ry = Math.abs(dy / 2) * zoom;
      return (
        <ellipse
          cx={sc.x}
          cy={sc.y}
          rx={rx}
          ry={ry}
          stroke="#4a90d9"
          strokeWidth={1}
          strokeDasharray="4,2"
          fill="rgba(74,144,217,0.1)"
          pointerEvents="none"
        />
      );
    }

    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isDrawing = !!annotationTool;

  return (
    <svg
      ref={svgRef}
      className="annotation-layer"
      width={width}
      height={height}
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 1,
        pointerEvents: isDrawing ? "all" : "none",
        overflow: "visible",
      }}
      tabIndex={isDrawing ? 0 : -1}
      onClick={isDrawing ? handleSvgClick : undefined}
      onDoubleClick={isDrawing ? handleSvgDoubleClick : undefined}
      onMouseDown={isDrawing ? handleSvgMouseDown : undefined}
      onMouseMove={isDrawing ? handleSvgMouseMove : undefined}
      onMouseUp={isDrawing ? handleSvgMouseUp : undefined}
      onPointerMove={dragState ? handlePointerMove : undefined}
      onPointerUp={dragState ? handlePointerUp : undefined}
      onKeyDown={handleKeyDown}
    >
      {/* Render all annotations */}
      {lines.map((ann) => {
        const annId = ann.id;
        // While this annotation is being dragged, render it at the live
        // local preview position (see the FE-142 comment above
        // handleAnnotationPointerDown) instead of its store position, which
        // isn't written until pointerup.
        const displayAnn: Annotation =
          dragState && dragState.annotationId === annId && ann.position
            ? { ...ann, position: dragState.livePosition }
            : ann;
        return (
          <g key={annId} style={{ pointerEvents: isDrawing ? "none" : "all" }}>
            {renderAnnotation(
              displayAnn,
              pan.x,
              pan.y,
              zoom,
              selection.has(annId),
              editingId === annId,
              (e) => handleAnnotationPointerDown(e, annId),
              () => {
                if (ann.kind === "text") {
                  setEditingId(annId);
                  setEditText(ann.text ?? "");
                }
              },
              editText,
              setEditText,
              commitTextEdit,
            )}
          </g>
        );
      })}

      {/* Ghost preview for in-progress drawing */}
      {renderGhost()}
    </svg>
  );
}

export default AnnotationLayer;
