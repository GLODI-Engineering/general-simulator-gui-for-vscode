import { useState } from "react";
import type { EdgeProps } from "reactflow";
import type { Wire } from "../../model/types";
import { useUiStore } from "../../store";
import { useWireColorStore } from "../../store/wire-colors";
import { mutateActiveModelFromStore } from "../model-mutation";
import { HOP_RADIUS } from "./hops";
import { type Junction, computeJunctions } from "./junctions";
import { REJECT_COLOR, isCausalDomain, wireColorForDomain } from "./wire-color";
import {
  autoOrthogonalPath,
  buildWirePoints,
  isOrthogonalPolyline,
  snapNearOrthogonal,
  wireSvgPathWithHops,
} from "./wire-path";

export const WIRE_STROKE = 2.4 * 1.6; // ≈ 3.84 px at zoom 1

interface WireEdgeData {
  wire: Wire;
}

export function WireEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<WireEdgeData>) {
  const wire = data?.wire;
  const canvasTool = useUiStore((state) => state.canvasTool);
  const wireColorOverrides = useWireColorStore((state) => state.overrides);
  const [editingLabel, setEditingLabel] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");

  const commitLabel = () => {
    if (wire) {
      const trimmed = draftLabel.trim();
      mutateActiveModelFromStore("label wire", (model) => {
        const target = model.wires.find((w) => w.id === wire.id);
        if (target) target.label = trimmed.length > 0 ? trimmed : null;
      });
    }
    setEditingLabel(false);
  };

  const waypoints = wire?.waypoints ?? [];
  const points = buildWirePoints({ x: sourceX, y: sourceY }, waypoints, { x: targetX, y: targetY });
  const orthogonal = isOrthogonalPolyline(points);
  const hasWaypoints = waypoints.length > 0;
  const domainColor = wire
    ? (wireColorOverrides[wire.kind] ?? wireColorForDomain(wire.kind))
    : "#0a0a0a";
  // Signal wires get a directional arrowhead at their destination end — a signal-flow
  // connection has a real direction (driver -> reader) that an electrical wire doesn't,
  // so only "signal" gets one. `context-stroke` (set on the marker itself, see Canvas.tsx)
  // makes the arrowhead pick up this same domainColor automatically, including a
  // user-customized override, without needing a marker per color.
  const isSignalWire = isCausalDomain(wire?.kind);

  // `orthogonal` allows a few px of tolerance (near-miss coordinate rounding, see
  // isOrthogonalPolyline's own doc comment) — snap those near-miss segments to exactly
  // horizontal/vertical before drawing, or the wire renders as the still-slightly-diagonal
  // raw points: a small but visible lean at every near-miss segment.
  const snappedPoints = orthogonal ? snapNearOrthogonal(points) : points;

  // Determine path and visual state:
  // - No waypoints + non-orthogonal → auto L-route (ReactFlow handle drift)
  // - Has waypoints + non-orthogonal → bad model data, show reject style
  // - Orthogonal → normal render
  const showReject = !orthogonal && hasWaypoints;
  const source = points[0];
  const target = points[points.length - 1];
  // Hops come from the canvas, which is the only place that knows where every
  // other wire runs. A wire drawn on its own simply has none.
  const hops = (data as { hops?: Array<{ at: [number, number] }> } | undefined)?.hops ?? [];
  const path =
    !orthogonal && !hasWaypoints && source && target
      ? autoOrthogonalPath(source, target)
      : wireSvgPathWithHops(snappedPoints, hops, HOP_RADIUS);

  const pinned = wire?.pinned === true;

  // Use the actual rendered points for segment handles — when autoOrthogonalPath
  // inserts a bend, the segments must match the visual L-shape, not the raw 2-point data.
  const renderPoints: Array<[number, number]> =
    !orthogonal && !hasWaypoints && source && target
      ? source[0] === target[0] || source[1] === target[1]
        ? [source, target]
        : [source, [target[0], source[1]], target]
      : snappedPoints;

  const segments: Array<{
    index: number;
    axis: "h" | "v";
    mx: number;
    my: number;
    x0: number;
    y0: number;
    len: number;
  }> = [];
  for (let i = 0; i < renderPoints.length - 1; i++) {
    const a = renderPoints[i];
    const b = renderPoints[i + 1];
    if (!a || !b) {
      continue;
    }
    const axis: "h" | "v" = a[1] === b[1] ? "h" : "v";
    const x0 = Math.min(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const len = Math.max(Math.abs(axis === "h" ? b[0] - a[0] : b[1] - a[1]), 12);
    segments.push({ index: i, axis, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, x0, y0, len });
  }

  // FE-157: anchor the name label/edit-input at the midpoint of the wire's
  // longest segment — avoids landing exactly on a corner bend, which the
  // simpler "midpoint of the whole polyline" would risk for an L-shaped wire.
  let labelAnchor: { mx: number; my: number } | null = null;
  let labelAnchorLen = -1;
  for (const seg of segments) {
    if (seg.len > labelAnchorLen) {
      labelAnchor = { mx: seg.mx, my: seg.my };
      labelAnchorLen = seg.len;
    }
  }

  return (
    <g
      className={`wire-edge${selected ? " is-selected" : ""}${showReject ? " is-invalid" : ""}`}
      data-wire-id={wire?.id}
      data-orthogonal={orthogonal ? "true" : "false"}
    >
      {/* Wide transparent hit area for click/drag detection.
          FE-156: stroke/strokeWidth moved into `style` — same override as
          the visible path below (ReactFlow's default .react-flow__edge-path
          CSS beats presentation attributes), which meant this hit target
          was actually rendering at CSS's 1px instead of the intended 12px,
          making wires harder to click/select than designed. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: canvas/SVG pointer
          hit-target for a schematic-editing tool (wire body click-to-select,
          drag, and label-edit) — there's no natural keyboard equivalent for
          picking a specific wire on the canvas, matching this file's other
          mouse-only interactions (e.g. the segment-handle drag below). */}
      <path
        className="react-flow__edge-path wire-edge__hit"
        d={path}
        fill="none"
        style={{ stroke: "transparent", strokeWidth: 12, pointerEvents: "stroke" }}
        onMouseDown={(event) => {
          if (!wire) return;
          // FE-157: in Label mode, the name editor opens from onClick below
          // instead (a click, unlike mousedown, only fires once the full
          // mousedown→mouseup gesture completes on compatible targets — see
          // that handler for why opening it here raced itself: inserting the
          // <input> mid-mousedown changed the DOM under the pointer before
          // the matching mouseup/click fired, blurring it shut immediately).
          // Still swallow the wire-branch behavior below, which only makes
          // sense in Wire mode anyway.
          if (canvasTool === "label") {
            event.stopPropagation();
            return;
          }
          window.dispatchEvent(
            new CustomEvent("gensim:wire-body-click", {
              detail: { wireId: wire.id, clientX: event.clientX, clientY: event.clientY },
            }),
          );
        }}
        onClick={(event) => {
          if (!wire || canvasTool !== "label") return;
          event.stopPropagation();
          setDraftLabel(wire.label ?? "");
          setEditingLabel(true);
        }}
      />
      {/* Visible wire stroke.
          FE-156: color/width set via `style`, not SVG presentation attributes
          (stroke=/strokeWidth=) — ReactFlow's own bundled stylesheet declares
          `.react-flow__edge-path { stroke: #b1b1b7; stroke-width: 1; }`, and
          a CSS class rule always wins over a presentation attribute
          regardless of DOM order, so those attributes were being silently
          overridden the whole time: every wire rendered as ReactFlow's
          default thin light-gray, never the intended per-domain color at
          WIRE_STROKE width (already sized to match component stroke width —
          see the SYMBOL_SCALE comment in BlockSymbol.tsx). Inline `style`
          outranks an external class rule without `!important`, so this is
          the minimal fix — the color/width logic itself was already right. */}
      <path
        className="react-flow__edge-path wire-edge__path"
        d={path}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={isSignalWire && !showReject ? "url(#gensim-signal-arrow)" : undefined}
        style={{
          stroke: showReject ? REJECT_COLOR : domainColor,
          strokeWidth: selected ? WIRE_STROKE * 1.5 : WIRE_STROKE,
          strokeDasharray: showReject ? "5 3" : undefined,
        }}
      />
      {/* FE-157: wire name — click a wire in Label mode (toolbar/Edit menu)
          to set it. Shown next to the wire once set, regardless of tool. */}
      {editingLabel && labelAnchor ? (
        <foreignObject
          x={labelAnchor.mx - 55}
          y={labelAnchor.my - 12}
          width={110}
          height={24}
          className="wire-edge__label-editor"
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: editing mode requires focus
            autoFocus
            className="wire-edge__label-input"
            value={draftLabel}
            aria-label="Wire name"
            onChange={(event) => setDraftLabel(event.target.value)}
            onBlur={commitLabel}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitLabel();
              if (event.key === "Escape") setEditingLabel(false);
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          />
        </foreignObject>
      ) : wire?.label && labelAnchor ? (
        <text
          x={labelAnchor.mx}
          y={labelAnchor.my - 6}
          textAnchor="middle"
          className="wire-edge__label"
        >
          {wire.label}
        </text>
      ) : null}
      {segments.map((seg) => (
        <rect
          key={`${wire?.id ?? "wire"}-seg-${seg.index}`}
          className="wire-edge__segment-handle"
          x={seg.axis === "h" ? seg.x0 : seg.mx - 6}
          y={seg.axis === "v" ? seg.y0 : seg.my - 6}
          width={seg.axis === "h" ? seg.len : 12}
          height={seg.axis === "v" ? seg.len : 12}
          fill="transparent"
          style={{
            cursor: seg.axis === "h" ? "ns-resize" : "ew-resize",
            // FE-157: these sit on top of the hit-area path in paint order
            // and normally always intercept mousedown (segment-drag works
            // regardless of tool) — but that means a click anywhere on a
            // wire in Label mode never reaches the hit-path's label-editor
            // handler below. Let clicks pass through in Label mode instead.
            pointerEvents: canvasTool === "label" ? "none" : "all",
          }}
          onMouseDown={(event) => {
            if (!wire) return;
            event.preventDefault();
            event.stopPropagation();
            window.dispatchEvent(
              new CustomEvent("gensim:wire-segment-drag-start", {
                detail: {
                  wireId: wire.id,
                  segIdx: seg.index,
                  axis: seg.axis,
                  clientX: event.clientX,
                  clientY: event.clientY,
                },
              }),
            );
          }}
        />
      ))}
      {pinned
        ? waypoints.map(([x, y], index) => (
            <rect
              key={`${wire?.id ?? "wire"}-pin-${index}`}
              className="wire-edge__pin"
              x={Math.round(x) - 3}
              y={Math.round(y) - 3}
              width={6}
              height={6}
              fill="#2563eb"
              stroke="#ffffff"
              strokeWidth={1}
            />
          ))
        : null}
    </g>
  );
}

export default WireEdge;

/**
 * Renders a filled dot at each junction. Drawn in flow coordinates, so the dots
 * scale with the viewport zoom along with the rest of the canvas. Pass the
 * model wires (or pre-computed junctions) from the overlay layer.
 */
export function JunctionDots({
  wires,
  junctions,
  radius = 4,
}: {
  wires?: Wire[];
  junctions?: Junction[];
  radius?: number;
}) {
  const dots = junctions ?? (wires ? computeJunctions(wires) : []);
  return (
    <g className="wire-junctions" data-junction-count={dots.length}>
      {dots.map((j) => (
        <circle
          key={`junction-${j.x}-${j.y}`}
          className="wire-junction"
          cx={j.x}
          cy={j.y}
          r={radius}
          fill="#334155"
        />
      ))}
    </g>
  );
}
