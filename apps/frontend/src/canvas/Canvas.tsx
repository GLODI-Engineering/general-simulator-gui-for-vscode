import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Controls,
  type Node,
  type NodeChange,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useStoreApi,
} from "reactflow";
import "reactflow/dist/style.css";
import { listTiers } from "../library/catalog-core";
import { canSwap } from "../library/fidelity-swap";
import { insertAtPosition } from "../library/insert";
import type { Block, PortKindDomain, Wire } from "../model/types";
import { useGraphStore, useLibraryStore, useToastStore, useUiStore } from "../store";
import { rerouteWiresForBlocks } from "../store/graph";
import { useIpcStore } from "../store/ipc";
import { resolveModelAtPath } from "../store/model";
import { useWaveformStore } from "../store/waveform";
import { ProbeAssignModal, isProbeBlockType } from "../waveform/ProbeAssignModal";
import { AnnotationLayer } from "./AnnotationLayer";
import { Breadcrumb } from "./Breadcrumb";
import { CanvasOverlay, ProbeOverlay } from "./CanvasOverlay";
import { ContextMenu } from "./ContextMenu";
import { type FlowBlockData, deriveFlowEdges, deriveFlowNodes } from "./derive-flow-state";
import { resolveDroppedBlock, screenToModelCoords, setActiveDragBlock } from "./dnd";
import { schematicBounds } from "./fit-bounds";
import WireEdge from "./edges/WireEdge";
import { computeHops } from "./edges/hops";
import { type Junction, computeJunctions } from "./edges/junctions";
import { applySegDrag } from "./edges/segment-drag";
import { GridLayer } from "./grid/GridLayer";
import {
  activeModelFromStore,
  activeSubcktDefsFromStore,
  mutateActiveModelFromStore,
} from "./model-mutation";
import BlockNode from "./nodes/BlockNode";
import { getMetadataPortCenters, SYMBOL_SCALE } from "./nodes/port-hit-test";
import { resolveBlockBbox, resolveBlockPorts } from "./nodes/resolve-ports";
import { canConnect } from "./port-compat";
import { readProbes, removeProbe } from "./probes";
import { type RouterComponent, getObstacles } from "./router/obstacles";
import { type Direction, routeOrtho, simplifyPts } from "./router/ortho-route";
import { resolveBlockMetadata } from "./subckt-metadata";

const nodeTypes = { block: BlockNode };
const edgeTypes = { wire: WireEdge };

// ── Wire draw types ───────────────────────────────────────────────────────────

interface ResolvedPort {
  blockId: string;
  portId: string;
  kind: PortKindDomain;
  direction: "in" | "out" | "inout" | undefined;
  center: { x: number; y: number };
  domain: PortKindDomain;
  /** Axis the port faces after mirror+rotation — seeds the route's first segment. */
  exitDir: Direction;
}

interface WireDrawState {
  from: ResolvedPort;
  /** Explicit user bends in model coordinates */
  waypoints: Array<{ x: number; y: number }>;
  posture: "horizontal-first" | "vertical-first";
  /** Cursor position in canvas-div–relative pixels */
  cursor: { x: number; y: number };
}

// ── Store-based port resolver (safe to call from effects / global handlers) ───

function resolvePortFromStore(blockId: string, portId: string): ResolvedPort | null {
  const { blocks } = activeModelFromStore();
  const { catalog } = useLibraryStore.getState();
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  const metadata = resolveBlockMetadata(block, catalog, activeSubcktDefsFromStore());
  if (!metadata) return null;
  const resolved = resolveBlockPorts(metadata, block.params);
  const inPort = resolved.inputs.find((p) => p.id === portId);
  const outPort = resolved.outputs.find((p) => p.id === portId);
  const portDef = inPort ?? outPort;
  if (!portDef) return null;
  const portEntry = getMetadataPortCenters(block, metadata).find((p) => p.id === portId);
  if (!portEntry) return null;
  const center = portEntry.stubTip;
  const idLower = portId.toLowerCase();
  const direction = inPort
    ? "in"
    : outPort
      ? "out"
      : idLower.includes("out")
        ? "out"
        : idLower.includes("in")
          ? "in"
          : undefined;
  return {
    blockId,
    portId,
    kind: portDef.kind.domain as PortKindDomain,
    direction,
    center,
    domain: block.domain,
    exitDir: portEntry.exitDir,
  };
}

// ── Wire commit (reads store directly, safe to call from any context) ─────────

function inferExitDir(points: Array<[number, number]>): Direction {
  if (points.length < 2) {
    return null;
  }
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  if (!a || !b) {
    return null;
  }
  return a[0] === b[0] ? "v" : "h";
}

function modelToRouterComponents(
  model: ReturnType<typeof activeModelFromStore>,
): RouterComponent[] {
  const { catalog } = useLibraryStore.getState();
  const subcktDefs = model.subckt_defs ?? activeSubcktDefsFromStore();
  return model.blocks.map((block) => {
    if (block.type === "routing.junction") {
      return {
        position: [block.position[0], block.position[1]],
        size: { w: 1, h: 1 },
        rotation: block.rotation,
        ports: [{ x: block.position[0], y: block.position[1] }],
      };
    }
    const metadata = resolveBlockMetadata(block, catalog, subcktDefs);
    // See the identical fix + comment in store/graph.ts's own modelToRouterComponents:
    // obstacle size must be resolveBlockBbox(...) * SYMBOL_SCALE, matching the scaled
    // model-space coordinates ports/wires already use, or every obstacle box here is
    // undersized by 1.6x and this interactive router "avoids" a box smaller than what
    // is actually drawn.
    const [rawW, rawH] = metadata
      ? resolveBlockBbox(metadata, block.params)
      : [60 / SYMBOL_SCALE, 40 / SYMBOL_SCALE];
    const w = rawW * SYMBOL_SCALE;
    const h = rawH * SYMBOL_SCALE;
    const ports = metadata
      ? getMetadataPortCenters(block, metadata).map((entry) => ({
          x: entry.stubTip.x,
          y: entry.stubTip.y,
        }))
      : [{ x: block.position[0], y: block.position[1] }];
    return {
      position: [block.position[0], block.position[1]],
      size: { w, h },
      rotation: block.rotation,
      ports,
    };
  });
}

function routeWithAnchors(
  from: { x: number; y: number },
  to: { x: number; y: number },
  anchors: Array<{ x: number; y: number }>,
  initialDir: Direction,
  finalDir: Direction = null,
): Array<[number, number]> {
  const model = activeModelFromStore();
  const obs = getObstacles(
    modelToRouterComponents(model),
    Math.round(from.x),
    Math.round(from.y),
    Math.round(to.x),
    Math.round(to.y),
  );

  const targets = [...anchors, to].map(
    (point) => [Math.round(point.x), Math.round(point.y)] as [number, number],
  );
  const out: Array<[number, number]> = [[Math.round(from.x), Math.round(from.y)]];
  let prevDir = initialDir;

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    if (!target) {
      continue;
    }
    const current = out[out.length - 1] ?? target;
    // Only the final leg lands on a port, so only it carries an arrival facing.
    const legEndDir = i === targets.length - 1 ? finalDir : null;
    const seg = routeOrtho(current[0], current[1], target[0], target[1], prevDir, obs, legEndDir);
    if (seg.length > 1) {
      out.push(...seg.slice(1));
    }
    prevDir = inferExitDir(out);
  }

  return simplifyPts(out);
}

function resolveEndpointCenterFromStore(endpoint: { block: string; port: string }): {
  x: number;
  y: number;
} | null {
  const model = activeModelFromStore();
  const block = model.blocks.find((candidate) => candidate.id === endpoint.block);
  if (!block) {
    return null;
  }
  if (block.type === "routing.junction") {
    return { x: block.position[0], y: block.position[1] };
  }
  const port = resolvePortFromStore(endpoint.block, endpoint.port);
  if (port) {
    return port.center;
  }
  return { x: block.position[0], y: block.position[1] };
}

function commitWireToPort(
  src: ResolvedPort,
  dstBlockId: string,
  dstPortId: string,
  explicitWaypoints: Array<{ x: number; y: number }> = [],
  posture: "horizontal-first" | "vertical-first" = "horizontal-first",
) {
  if (src.blockId === dstBlockId && src.portId === dstPortId) return;

  const dst = resolvePortFromStore(dstBlockId, dstPortId);
  if (!dst) return;

  const currentWires = activeModelFromStore().wires;
  const dstDriven = currentWires.some(
    (w) => w.to.block === dst.blockId && w.to.port === dst.portId,
  );
  const srcDriven = currentWires.some(
    (w) => w.to.block === src.blockId && w.to.port === src.portId,
  );

  let finalSrc = { ...src, driven: srcDriven };
  let finalDst = { ...dst, driven: dstDriven };

  // Ensure signal flows output → input
  let swapped = false;
  if (finalSrc.direction === "in" && finalDst.direction !== "in") {
    [finalSrc, finalDst] = [
      { ...finalDst, driven: finalDst.driven },
      { ...finalSrc, driven: finalSrc.driven },
    ];
    swapped = true;
  }

  const compat = canConnect(
    { kind: finalSrc.kind, direction: finalSrc.direction },
    { kind: finalDst.kind, direction: finalDst.direction, driven: finalDst.driven },
  );
  if (!compat.ok) {
    useToastStore.getState().pushToast(`Cannot draw wire: ${compat.reason}`);
    return;
  }

  const duplicate = currentWires.some(
    (w) =>
      w.from.block === finalSrc.blockId &&
      w.from.port === finalSrc.portId &&
      w.to.block === finalDst.blockId &&
      w.to.port === finalDst.portId,
  );
  if (duplicate) {
    useToastStore.getState().pushToast("Wire already exists.");
    return;
  }

  // `posture` is seeded from the drag's source port facing (and may since have
  // been toggled by the user), so it already carries the right bias — unless
  // the endpoints were swapped, in which case it describes the other end.
  const initialDir: Direction = swapped
    ? (finalSrc.exitDir ?? (posture === "horizontal-first" ? "h" : "v"))
    : posture === "horizontal-first"
      ? "h"
      : "v";

  const routed = routeWithAnchors(
    finalSrc.center,
    finalDst.center,
    explicitWaypoints,
    initialDir,
    finalDst.exitDir,
  );
  const waypoints: Array<[number, number]> = routed.slice(1, -1);
  mutateActiveModelFromStore("draw wire", (model) => {
    model.wires.push({
      id: `wire-${crypto.randomUUID()}`,
      from: { block: finalSrc.blockId, port: finalSrc.portId },
      to: { block: finalDst.blockId, port: finalDst.portId },
      waypoints,
      pinned: false,
      net: null,
      kind: finalSrc.domain,
    });
  });
}

// ── Live preview SVG ─────────────────────────────────────────────────────────

function WirePreview({
  from,
  cursor,
  pan,
  zoom,
  waypoints,
  posture,
}: {
  from: { x: number; y: number };
  cursor: { x: number; y: number };
  pan: { x: number; y: number };
  zoom: number;
  waypoints: Array<{ x: number; y: number }>;
  posture: "horizontal-first" | "vertical-first";
}) {
  const cursorModel = { x: (cursor.x - pan.x) / zoom, y: (cursor.y - pan.y) / zoom };
  const routedModel = routeWithAnchors(
    from,
    cursorModel,
    waypoints,
    posture === "horizontal-first" ? "h" : "v",
  );
  const points = routedModel.map(([x, y]) => `${x * zoom + pan.x},${y * zoom + pan.y}`).join(" ");

  return (
    <polyline
      points={points}
      fill="none"
      stroke="#0a0a0a"
      strokeWidth={3.6}
      strokeDasharray="6 3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

// ── CanvasSurface ─────────────────────────────────────────────────────────────

function JunctionOverlay({
  junctions,
  pan,
  zoom,
}: {
  junctions: Junction[];
  pan: { x: number; y: number };
  zoom: number;
}) {
  if (junctions.length === 0) {
    return null;
  }
  const radius = Math.max(2, Math.min(10, 4 * zoom));
  return (
    <div
      className="canvas-junction-overlay"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 11,
      }}
    >
      {junctions.map((junction) => (
        <span
          key={`junction-${junction.x}-${junction.y}`}
          className="wire-junction-dot"
          style={{
            position: "absolute",
            left: `${junction.x * zoom + pan.x - radius}px`,
            top: `${junction.y * zoom + pan.y - radius}px`,
            width: `${radius * 2}px`,
            height: `${radius * 2}px`,
            borderRadius: "999px",
            background: "#334155",
          }}
        />
      ))}
    </div>
  );
}

function CanvasSurface() {
  const document = useGraphStore((state) => state.document);
  const hierarchyPath = useUiStore((state) => state.hierarchyPath);
  const activeModel = resolveModelAtPath(document.model, hierarchyPath) ?? document.model;
  const blocks = activeModel.blocks;
  const wires = activeModel.wires;
  const probes = readProbes(activeModel);
  const selection = useUiStore((state) => state.selection);
  const setSelection = useUiStore((state) => state.setSelection);
  const showDimLabels = useUiStore((state) => state.showDimLabels);
  const popHierarchyTo = useUiStore((state) => state.popHierarchyTo);
  const enterSubsystem = useUiStore((state) => state.enterSubsystem);
  const canvasTool = useUiStore((state) => state.canvasTool);
  const setCanvasTool = useUiStore((state) => state.setCanvasTool);
  const selectedProbeIds = useUiStore((state) => state.selectedProbeIds);
  const toggleProbeSelection = useUiStore((state) => state.toggleProbeSelection);
  const zoom = useUiStore((state) => state.zoom);
  const pan = useUiStore((state) => state.pan);
  const setZoom = useUiStore((state) => state.setZoom);
  const setPan = useUiStore((state) => state.setPan);
  const pushToast = useToastStore.getState().pushToast;
  const catalog = useLibraryStore((state) => state.catalog);
  const { setViewport, zoomIn, zoomOut, fitView, fitBounds } = useReactFlow();
  const storeApi = useStoreApi();

  // Sync zoom/pan from UI store → ReactFlow viewport. This only needs to
  // handle store writes that did NOT originate from ReactFlow itself (e.g.
  // view.zoom-100, which resets to a known pan/zoom) — zoom-in/zoom-out/fit
  // now call ReactFlow's own zoomIn()/zoomOut()/fitView() below instead of
  // writing zoom/pan directly, because a naive setZoom() with a stale pan
  // anchors the zoom on the model origin (0,0) instead of the viewport
  // center, producing a diagonal drift on every click (FE-139).
  useEffect(() => {
    setViewport({ x: pan.x, y: pan.y, zoom });
  }, [pan.x, pan.y, zoom, setViewport]);

  /**
   * Frame everything that has ink in it, not just the nodes.
   *
   * `fitView` frames node boxes, which on a schematic leaves out any wire
   * that runs outside them — a return rail below the parts is the usual
   * casualty. `schematicBounds` unions the nodes, their leads and every
   * waypoint; `fitBounds` then frames that. Falls back to `fitView` for an
   * empty sheet, where there are no bounds to compute.
   */
  const fitSchematic = useCallback(() => {
    const state = useGraphStore.getState();
    const catalogNow = useLibraryStore.getState().catalog;
    const subcktDefs = activeSubcktDefsFromStore();
    const bounds = schematicBounds(state.document.model.blocks, state.document.model.wires, (b) =>
      resolveBlockMetadata(b, catalogNow, subcktDefs),
    );
    if (bounds) {
      fitBounds(bounds, { duration: 0 });
    } else {
      fitView();
    }
  }, [fitBounds, fitView]);

  // Expose the real ReactFlow zoom/fit API on window so App.tsx's
  // module-level handleAction (outside the ReactFlowProvider tree, so it
  // cannot call useReactFlow() itself) can drive the toolbar's Zoom In/
  // Zoom Out/Fit buttons through the exact same viewport-centered math the
  // canvas's own bottom-left +/-/fit Controls already use correctly.
  // onMove above mirrors the resulting viewport back into the UI store, so
  // this stays a one-way call — no separate store write needed here.
  useEffect(() => {
    const windowRef = window as typeof window & {
      __gensim_canvasZoomIn?: () => void;
      __gensim_canvasZoomOut?: () => void;
      __gensim_canvasFitView?: () => void;
    };
    windowRef.__gensim_canvasZoomIn = () => zoomIn();
    windowRef.__gensim_canvasZoomOut = () => zoomOut();
    windowRef.__gensim_canvasFitView = () => fitSchematic();
    return () => {
      windowRef.__gensim_canvasZoomIn = undefined;
      windowRef.__gensim_canvasZoomOut = undefined;
      windowRef.__gensim_canvasFitView = undefined;
    };
  }, [zoomIn, zoomOut, fitSchematic]);

  const [contextMenu, setContextMenu] = useState<{
    blockId: string;
    x: number;
    y: number;
  } | null>(null);

  // ── Probe assign modal state ───────────────────────────────────────────────
  const [probeModal, setProbeModal] = useState<{
    blockId: string;
    portId: string;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // ── Wire draw state ────────────────────────────────────────────────────────
  const [wireDraw, setWireDraw] = useState<WireDrawState | null>(null);
  // Ref so the stable global mouseup handler can read current value
  const wireDrawRef = useRef<WireDrawState | null>(null);
  wireDrawRef.current = wireDraw;

  const activeSegmentDragRef = useRef<{
    wireId: string;
    segIdx: number;
    axis: "h" | "v";
    origPts: Array<[number, number]>;
  } | null>(null);

  useEffect(() => {
    const updateSize = () => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setCanvasSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  // ── Global mouseup: commit or cancel wire draw ─────────────────────────────
  useEffect(() => {
    const handleGlobalMouseUp = (event: MouseEvent) => {
      const current = wireDrawRef.current;
      if (!current) return;

      // Model-space hit test: find the nearest port within a ~20 screen-pixel
      // radius. This is more reliable than DOM closest("[data-port-id]") because
      // port terminal elements (stub tips) are often rendered outside the
      // ReactFlow node div's layout rectangle via SVG overflow:visible, which
      // makes DOM hit-testing return the wrong element or nothing.
      let committed = false;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const { pan, zoom } = useUiStore.getState();
        const model = activeModelFromStore();
        const { catalog } = useLibraryStore.getState();
        const subcktDefs = activeSubcktDefsFromStore();
        const rawX = (event.clientX - rect.left - pan.x) / zoom;
        const rawY = (event.clientY - rect.top - pan.y) / zoom;
        const hitRadius = 20 / Math.max(zoom, 0.001);
        let minDist = Number.POSITIVE_INFINITY;
        let bestBlock: string | null = null;
        let bestPort: string | null = null;
        for (const block of model.blocks) {
          if (block.type === "routing.junction") continue;
          const metadata = resolveBlockMetadata(block, catalog, subcktDefs);
          if (!metadata) continue;
          for (const { id, stubTip } of getMetadataPortCenters(block, metadata)) {
            const d = Math.hypot(rawX - stubTip.x, rawY - stubTip.y);
            if (d <= hitRadius && d < minDist) {
              minDist = d;
              bestBlock = block.id;
              bestPort = id;
            }
          }
        }
        if (bestBlock && bestPort) {
          commitWireToPort(current.from, bestBlock, bestPort, current.waypoints, current.posture);
          committed = true;
        }
      }
      // Reset the draw once a wire lands on a target port, or whenever we are not
      // in continuous wire-tool mode. In wire mode a release that did NOT hit a
      // port keeps the draw alive so further waypoints can be placed; without the
      // `committed` check a drag-to-connect would leave a dangling draw originating
      // from the just-connected port.
      if (committed || useUiStore.getState().canvasTool !== "wire") {
        setWireDraw(null);
      }
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []); // stable: uses ref + module-level helpers that read store directly

  useEffect(() => {
    const handleWireBodyClick = (event: Event) => {
      const detail = (event as CustomEvent<{ wireId: string; clientX: number; clientY: number }>)
        .detail;
      const current = wireDrawRef.current;
      if (!detail || !current || useUiStore.getState().canvasTool !== "wire") return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const activeModel = activeModelFromStore();
      const existing = activeModel.wires.find((wire) => wire.id === detail.wireId);
      if (!existing) return;
      const [x, y] = screenToModelCoords(
        detail.clientX,
        detail.clientY,
        rect,
        useUiStore.getState().pan,
        useUiStore.getState().zoom,
        activeModel.grid,
      );
      const junctionId = `junction-${crypto.randomUUID()}`;
      const junctionBlock: Block = {
        id: junctionId,
        type: "routing.junction",
        paradigm: "routing",
        domain: existing.kind,
        fidelity: "n_a",
        position: [x, y],
        rotation: 0,
        mirror: "none",
        params: {},
        ic: {},
      };
      const makeWire = (wire: Omit<Wire, "id">): Wire => ({
        id: `wire-${crypto.randomUUID()}`,
        ...wire,
      });
      mutateActiveModelFromStore("branch wire", (model) => {
        model.wires = model.wires.filter((wire) => wire.id !== existing.id);
        model.blocks.push(junctionBlock);
        model.wires.push(
          makeWire({
            from: existing.from,
            to: { block: junctionId, port: "node" },
            waypoints: [[x, y]],
            pinned: false,
            net: existing.net,
            kind: existing.kind,
          }),
        );
        model.wires.push(
          makeWire({
            from: { block: junctionId, port: "node" },
            to: existing.to,
            waypoints: [[x, y]],
            pinned: false,
            net: existing.net,
            kind: existing.kind,
          }),
        );
        model.wires.push(
          makeWire({
            from: { block: current.from.blockId, port: current.from.portId },
            to: { block: junctionId, port: "node" },
            waypoints: [
              ...current.waypoints.map((point): [number, number] => [point.x, point.y]),
              [x, y],
            ],
            pinned: false,
            net: existing.net,
            kind: current.from.domain,
          }),
        );
      });
      setWireDraw(null);
    };
    window.addEventListener("gensim:wire-body-click", handleWireBodyClick);
    return () => window.removeEventListener("gensim:wire-body-click", handleWireBodyClick);
  }, []);

  useEffect(() => {
    const handleSegmentDragStart = (event: Event) => {
      const detail = (event as CustomEvent<{ wireId: string; segIdx: number; axis: "h" | "v" }>)
        .detail;
      if (!detail) return;
      const model = activeModelFromStore();
      const wire = model.wires.find((candidate) => candidate.id === detail.wireId);
      if (!wire) return;
      const from = resolveEndpointCenterFromStore(wire.from);
      const to = resolveEndpointCenterFromStore(wire.to);
      if (!from || !to) return;
      const fromPt: [number, number] = [Math.round(from.x), Math.round(from.y)];
      const toPt: [number, number] = [Math.round(to.x), Math.round(to.y)];
      let origPts: Array<[number, number]>;
      if (wire.waypoints.length === 0 && fromPt[0] !== toPt[0] && fromPt[1] !== toPt[1]) {
        origPts = [fromPt, [toPt[0], fromPt[1]], toPt];
      } else {
        origPts = [
          fromPt,
          ...wire.waypoints.map(([x, y]): [number, number] => [Math.round(x), Math.round(y)]),
          toPt,
        ];
      }
      activeSegmentDragRef.current = {
        wireId: wire.id,
        segIdx: detail.segIdx,
        axis: detail.axis,
        origPts,
      };
    };

    const applyDragAtEvent = (event: MouseEvent) => {
      const current = activeSegmentDragRef.current;
      if (!current) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const model = activeModelFromStore();
      const [x, y] = screenToModelCoords(
        event.clientX,
        event.clientY,
        rect,
        useUiStore.getState().pan,
        useUiStore.getState().zoom,
        model.grid,
      );
      const newValue = current.axis === "h" ? y : x;
      const nextPoints = applySegDrag(current, newValue);
      mutateActiveModelFromStore("segment-drag", (activeModel) => {
        activeModel.wires = activeModel.wires.map((wire) =>
          wire.id === current.wireId
            ? { ...wire, waypoints: nextPoints.slice(1, -1) as Array<[number, number]> }
            : wire,
        );
      });
    };

    const handleGlobalMouseMove = (event: MouseEvent) => {
      if (!activeSegmentDragRef.current) return;
      applyDragAtEvent(event);
    };

    const handleGlobalMouseUp = (event: MouseEvent) => {
      if (!activeSegmentDragRef.current) return;
      applyDragAtEvent(event);
      activeSegmentDragRef.current = null;
    };

    window.addEventListener("gensim:wire-segment-drag-start", handleSegmentDragStart);
    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("gensim:wire-segment-drag-start", handleSegmentDragStart);
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "/" && wireDrawRef.current) {
        event.preventDefault();
        setWireDraw((current) =>
          current
            ? {
                ...current,
                posture:
                  current.posture === "horizontal-first" ? "vertical-first" : "horizontal-first",
              }
            : null,
        );
        return;
      }
      if (event.key !== "Escape") return;
      if (!wireDrawRef.current && useUiStore.getState().canvasTool !== "wire") return;
      event.preventDefault();
      setWireDraw(null);
      useUiStore.getState().setCanvasTool("select");
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  // Base nodes derived from the graph store (positions, data). Selection
  // lives on the local React Flow node state so that internal drag (live
  // position) and selection are applied immediately via applyNodeChanges;
  // see the "Reflect programmatic selection" effect below for how the
  // store's selection stays in sync with it without looping.
  const baseNodes = useMemo(() => deriveFlowNodes(blocks), [blocks]);
  const [flowNodes, setFlowNodes] = useState<Array<Node<FlowBlockData>>>(baseNodes);

  // FE-145: reentrancy guard breaking the store↔ReactFlow selection sync
  // ping-pong — see the "Reflect programmatic selection" effect below. Holds
  // the *exact* selection onSelectionChange just wrote to the store (not a
  // bare boolean) so that if a second, different selection change (e.g. a
  // programmatic select-all) lands before this one is consumed, the guard
  // correctly recognizes it doesn't match and still syncs it — a boolean
  // flag would wrongly swallow that second, unrelated change too.
  const skipReflectForRef = useRef<Set<string> | null>(null);

  // Resync structure (added/removed/moved blocks) from the store while keeping
  // whatever selection React Flow currently shows.
  useEffect(() => {
    setFlowNodes((previous) => {
      const selectedById = new Map(previous.map((node) => [node.id, node.selected ?? false]));
      return baseNodes.map((node) => ({ ...node, selected: selectedById.get(node.id) ?? false }));
    });
  }, [baseNodes]);

  // Reflect programmatic selection (select-all, keymap, etc.) into the node
  // state.
  //
  // FE-145: this used to write `selected` directly onto local `flowNodes`
  // via setFlowNodes. That bypasses ReactFlow's own internal selection
  // bookkeeping (a separate registry it maintains for onSelectionChange,
  // multi-drag, etc.) — so on ReactFlow's very next internal re-render,
  // onSelectionChange fires again reporting its OWN (still-empty) internal
  // selection, which the sync-back handler below then used to overwrite
  // the store right back to empty. That's why Select All, Positioning,
  // and anything else driven by setSelection() outside of a direct
  // canvas click/rubber-band gesture appeared to silently do nothing:
  // the selection was set, then wiped again a render later.
  //
  // Fixed by going through ReactFlow's own store API (useStoreApi) instead
  // — addSelectedNodes()/unselectNodesAndEdges() update its internal
  // registry AND dispatch proper 'select'-type onNodesChange events (which
  // still flow through handleNodesChange below into flowNodes), so the
  // internal state and the rendered state agree and onSelectionChange's
  // next re-fire reports the same selection back, not empty.
  //
  // That two-way sync (store → ReactFlow here, ReactFlow → store in
  // onSelectionChange below) can ping-pong: writing into ReactFlow's
  // registry can trigger it to re-fire onSelectionChange, which would
  // call setSelection again, re-triggering this effect — observed as a
  // real "Maximum update depth exceeded" crash on double-click. Broken
  // with a reentrancy guard: onSelectionChange records the exact
  // selection it just wrote into skipReflectForRef before calling
  // setSelection for a change that *originated* from ReactFlow, so this
  // effect knows not to mirror that specific change straight back into
  // ReactFlow — it's already there. A *different* selection arriving
  // (e.g. a programmatic select-all landing right after a click) won't
  // match what's recorded, so it still gets synced normally.
  useEffect(() => {
    const skipFor = skipReflectForRef.current;
    if (
      skipFor &&
      skipFor.size === selection.size &&
      [...skipFor].every((id) => selection.has(id))
    ) {
      skipReflectForRef.current = null;
      return;
    }
    skipReflectForRef.current = null;
    const state = storeApi.getState();
    const currentlySelected = new Set(
      state
        .getNodes()
        .filter((node) => node.selected)
        .map((node) => node.id),
    );
    const sameSet =
      currentlySelected.size === selection.size &&
      [...selection].every((id) => currentlySelected.has(id));
    if (sameSet) {
      return;
    }
    if (selection.size === 0) {
      state.unselectNodesAndEdges();
    } else {
      state.addSelectedNodes([...selection]);
    }
  }, [selection, storeApi]);

  const handleNodesChange = (changes: NodeChange[]) => {
    setFlowNodes((previous) => applyNodeChanges(changes, previous));
  };

  // Endpoints are port lead tips; without them a three-way node formed by
  // wires that *end* at the same port is invisible to junction detection.
  const junctions = useMemo(() => {
    const tips = new Map<string, [number, number]>();
    for (const block of blocks) {
      const metadata = resolveBlockMetadata(block, catalog, activeSubcktDefsFromStore());
      if (!metadata) continue;
      for (const port of getMetadataPortCenters(block, metadata)) {
        tips.set(`${block.id}:${port.id}`, [port.stubTip.x, port.stubTip.y]);
      }
    }
    const resolve = (wire: (typeof wires)[number]) => {
      const from = tips.get(`${wire.from.block}:${wire.from.port}`);
      const to = tips.get(`${wire.to.block}:${wire.to.port}`);
      return from && to ? ([from, to] as [[number, number], [number, number]]) : null;
    };
    return { dots: computeJunctions(wires, resolve), hops: computeHops(wires, resolve) };
  }, [wires, blocks, catalog]);

  const edges = useMemo(() => deriveFlowEdges(wires, junctions.hops), [wires, junctions.hops]);

  const applySelection = (updater: (selection: Set<string>) => Set<string>) => {
    setSelection(updater(new Set(selection)));
  };

  // Mirror ReactFlow's selection (including rubber-band / box select, which
  // onNodeClick does not cover) into the store. ReactFlow re-fires this on every
  // internal re-render after our own setSelection, so we bail when the reported
  // selection already matches the store — that equality guard breaks the update
  // loop that previously forced this handler to be a no-op.
  const onSelectionChange = (params: {
    nodes: Array<{ id: string }>;
    edges: Array<{ id: string }>;
  }) => {
    const nextIds = params.nodes.map((node) => node.id);
    const current = useUiStore.getState().selection;
    if (nextIds.length !== current.size || !nextIds.every((id) => current.has(id))) {
      skipReflectForRef.current = new Set(nextIds);
      setSelection(nextIds);
    }
    const nextWireIds = params.edges.map((edge) => edge.id);
    const currentWires = useUiStore.getState().selectedWireIds;
    if (
      nextWireIds.length !== currentWires.size ||
      !nextWireIds.every((id) => currentWires.has(id))
    ) {
      useUiStore.getState().setSelectedWireIds(nextWireIds);
    }
  };

  // ── Canvas mouse handlers ──────────────────────────────────────────────────

  /** Mousedown near a port → start wire drag (model-space hit test) */
  const handlePortMouseDownCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const model = activeModelFromStore();
    const subcktDefs = activeSubcktDefsFromStore();
    const rawX = (event.clientX - rect.left - pan.x) / zoom;
    const rawY = (event.clientY - rect.top - pan.y) / zoom;
    const hitRadius = 20 / Math.max(zoom, 0.001);
    let minDist = Number.POSITIVE_INFINITY;
    let targetBlockId: string | null = null;
    let targetPortId: string | null = null;
    for (const block of model.blocks) {
      if (block.type === "routing.junction") continue;
      const metadata = resolveBlockMetadata(block, catalog, subcktDefs);
      if (!metadata) continue;
      for (const { id, stubTip } of getMetadataPortCenters(block, metadata)) {
        const d = Math.hypot(rawX - stubTip.x, rawY - stubTip.y);
        if (d <= hitRadius && d < minDist) {
          minDist = d;
          targetBlockId = block.id;
          targetPortId = id;
        }
      }
    }
    if (!targetBlockId || !targetPortId) return;

    const resolved = resolvePortFromStore(targetBlockId, targetPortId);
    if (!resolved) return;

    event.preventDefault();
    event.stopPropagation();

    const current = wireDrawRef.current;
    if (current && canvasTool === "wire") {
      commitWireToPort(
        current.from,
        targetBlockId,
        targetPortId,
        current.waypoints,
        current.posture,
      );
      setWireDraw(null);
      return;
    }

    setWireDraw({
      from: resolved,
      waypoints: [],
      // Leave the port along its own facing; the user can still toggle posture.
      posture: resolved.exitDir === "v" ? "vertical-first" : "horizontal-first",
      cursor: { x: event.clientX - rect.left, y: event.clientY - rect.top },
    });
  };

  /** Mousemove → update live preview cursor */
  const handleMouseMoveCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!wireDraw) return;
    event.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setWireDraw((prev) =>
      prev
        ? { ...prev, cursor: { x: event.clientX - rect.left, y: event.clientY - rect.top } }
        : null,
    );
  };

  const onNodeClick = (event: React.MouseEvent, node: { id: string }) => {
    setContextMenu(null);
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      applySelection((current) => {
        if (current.has(node.id)) {
          current.delete(node.id);
        } else {
          current.add(node.id);
        }
        return current;
      });
      return;
    }
    setSelection([node.id]);
  };

  const attemptSwapFidelity = (blockId: string, newFidelity: string) => {
    const graph = useGraphStore.getState();
    const preflight = canSwap(blockId, newFidelity, graph.document.model);
    if (!preflight.ok) {
      if (preflight.reason === "port-shape-mismatch") {
        const port = preflight.port ?? "<unknown>";
        if (preflight.wasKind && preflight.wouldKind) {
          pushToast(
            `Cannot swap: port ${port} kind mismatch (was ${preflight.wasKind}, would be ${preflight.wouldKind})`,
          );
        } else {
          pushToast(`Cannot swap: port ${port} kind mismatch`);
        }
      }
      setContextMenu(null);
      return;
    }

    graph.transact("swap fidelity", () => {
      const result = graph.swapFidelity(blockId, newFidelity);
      if (result.ok) {
        for (const wireId of result.removedWires) {
          pushToast(`Removed wire ${wireId} (port no longer present)`);
        }
      }
    });

    setContextMenu(null);
  };

  const onNodeContextMenu = (event: React.MouseEvent, node: { id: string }) => {
    event.preventDefault();
    setSelection([node.id]);
    setContextMenu({ blockId: node.id, x: event.clientX, y: event.clientY });
  };

  const onSelectionKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      if (wireDraw || canvasTool === "wire") {
        event.preventDefault();
        setWireDraw(null);
        setCanvasTool("select");
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelection(blocks.map((block) => block.id));
      return;
    }
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelection([]);
      return;
    }
  };

  const contextBlock = contextMenu
    ? (blocks.find((block) => block.id === contextMenu.blockId) ?? null)
    : null;
  const contextTiers = contextBlock ? listTiers(contextBlock.type) : [];

  // catalog is still subscribed for the resolvePort used in onContextMenu path
  void catalog;

  return (
    <div
      ref={canvasRef}
      className="canvas-flow"
      data-testid="canvas-surface"
      data-canvas-tool={canvasTool}
      onKeyDown={onSelectionKeyDown}
      onMouseDownCapture={handlePortMouseDownCapture}
      onMouseMoveCapture={handleMouseMoveCapture}
    >
      <GridLayer width={canvasSize.width} height={canvasSize.height} />
      <AnnotationLayer width={canvasSize.width} height={canvasSize.height} />
      <CanvasOverlay
        showDimLabels={showDimLabels}
        blocks={blocks}
        wires={wires}
        pan={pan}
        zoom={zoom}
      />
      <JunctionOverlay junctions={junctions.dots} pan={pan} zoom={zoom} />
      <ProbeOverlay
        probes={probes}
        selectedProbeIds={selectedProbeIds}
        onDeleteProbe={(probeId) => {
          const graph = useGraphStore.getState();
          const path = useUiStore.getState().hierarchyPath;
          graph.transact("delete probe", () => {
            graph.mutateModelAtPath(path, (m) => {
              removeProbe(m, probeId);
            });
          });
          useUiStore.getState().clearProbeSelection();
        }}
        onSelectProbe={toggleProbeSelection}
      />

      {/* Live wire-draw preview */}
      {wireDraw ? (
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
            zIndex: 10,
          }}
          aria-hidden="true"
        >
          <WirePreview
            from={wireDraw.from.center}
            cursor={wireDraw.cursor}
            pan={pan}
            zoom={zoom}
            waypoints={wireDraw.waypoints}
            posture={wireDraw.posture}
          />
        </svg>
      ) : null}

      <Breadcrumb path={hierarchyPath} blocks={document.model.blocks} onNavigate={popHierarchyTo} />
      <ReactFlow
        fitView={false}
        minZoom={0.2}
        maxZoom={2.5}
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={canvasTool === "select"}
        // FE-150: ReactFlow's defaults are panOnDrag=true / selectionOnDrag=false,
        // so a plain left-drag always pans — rubber-band select only works via
        // Shift+drag. With the Select tool active, a plain drag on empty canvas
        // should draw a selection box instead (that's the whole point of the
        // tool); the dedicated Pan tool keeps drag-to-pan. Middle/right-click
        // still pans in Select mode so users aren't stranded without panning.
        panOnDrag={canvasTool === "select" ? [1, 2] : true}
        selectionOnDrag={canvasTool === "select"}
        defaultViewport={{ x: pan.x, y: pan.y, zoom }}
        deleteKeyCode={null}
        onNodesChange={handleNodesChange}
        onEdgesChange={() => {
          // Graph store is canonical; React Flow change objects are ignored.
        }}
        onMove={(_, viewport) => {
          setPan({ x: Math.round(viewport.x), y: Math.round(viewport.y) });
          setZoom(viewport.zoom);
        }}
        onSelectionChange={onSelectionChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={(event, node) => {
          event.stopPropagation();
          const block = blocks.find((candidate) => candidate.id === node.id);
          if (block?.subsystem) {
            enterSubsystem(node.id);
            return;
          }
          // Probe-type blocks open the axes assign modal (or auto-create if no figures).
          if (block && isProbeBlockType(block.type)) {
            const wfState = useWaveformStore.getState();
            const lastManifest = useIpcStore.getState().lastManifest;
            if (wfState.figures.size === 0) {
              // No figures: auto-create and place signal immediately.
              if (lastManifest) {
                const figId = wfState.createFigure("Figure 1", 1, 1);
                const axId = wfState.createAxes(figId, 0, 0, "time");
                const sigName =
                  lastManifest.signals.find((s) => s.includes(block.id)) ?? lastManifest.signals[0];
                if (sigName) {
                  wfState.addSignalToAxes(axId, lastManifest.sim_id, sigName);
                }
              } else {
                // No manifest — show modal so user sees the warning.
                setProbeModal({ blockId: block.id, portId: "out" });
              }
            } else {
              const metadata = resolveBlockMetadata(
                block,
                useLibraryStore.getState().catalog,
                activeSubcktDefsFromStore(),
              );
              const firstOutputPort = metadata?.ports.outputs[0]?.id ?? "out";
              setProbeModal({ blockId: block.id, portId: firstOutputPort });
            }
            return;
          }
          useUiStore.getState().openParamPanel(node.id);
        }}
        onNodeContextMenu={onNodeContextMenu}
        onNodeDragStop={(_, node) => {
          const selectedIds = selection.has(node.id) ? [...selection] : [node.id];
          const original = blocks.find((block) => block.id === node.id);
          if (!original) {
            return;
          }

          const nextPosition: [number, number] = [
            Math.round(node.position.x),
            Math.round(node.position.y),
          ];
          const delta: [number, number] = [
            nextPosition[0] - original.position[0],
            nextPosition[1] - original.position[1],
          ];
          if (delta[0] === 0 && delta[1] === 0) {
            return;
          }

          mutateActiveModelFromStore("move block", (model) => {
            const idSet = new Set(selectedIds);
            model.blocks = model.blocks.map((block) =>
              idSet.has(block.id)
                ? {
                    ...block,
                    position: [block.position[0] + delta[0], block.position[1] + delta[1]],
                  }
                : block,
            );
            rerouteWiresForBlocks(model, idSet);
          });
        }}
        onDoubleClick={() => {
          useUiStore.getState().pushModal("quick-insert");
        }}
        onPaneClick={(event) => {
          setContextMenu(null);
          if (wireDraw && canvasTool === "wire") {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const grid = activeModelFromStore().grid;
            const [x, y] = screenToModelCoords(event.clientX, event.clientY, rect, pan, zoom, grid);
            setWireDraw((current) =>
              current
                ? {
                    ...current,
                    waypoints: [...current.waypoints, { x, y }],
                    cursor: { x: event.clientX - rect.left, y: event.clientY - rect.top },
                  }
                : null,
            );
            return;
          }
          setSelection([]);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
      <ContextMenu
        open={Boolean(contextMenu && contextBlock)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        tiers={contextTiers}
        currentTier={contextBlock?.fidelity ?? ""}
        onSelectTier={(tier) => {
          if (!contextBlock) {
            return;
          }
          attemptSwapFidelity(contextBlock.id, tier);
        }}
        onClose={() => {
          setContextMenu(null);
        }}
      />
      {/* Probe → axes assignment modal */}
      {probeModal && (
        <ProbeAssignModal
          blockId={probeModal.blockId}
          portId={probeModal.portId}
          onClose={() => setProbeModal(null)}
        />
      )}
    </div>
  );
}

export function Canvas() {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const canvasBackground = useUiStore((state) => state.canvasBackground);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const { pan, zoom } = useUiStore.getState();
    const { document: doc } = useGraphStore.getState();
    const grid = doc.model.grid;
    const catalog = useLibraryStore.getState().catalog;

    // Tries the custom MIME type, then text/plain, then the module tracker the
    // extension-host bridge keeps in sync for cross-webview drags. Custom MIME
    // types are unreadable both in WebKitGTK (Tauri/Linux) and across the VS
    // Code webview iframe boundary.
    const blockName = resolveDroppedBlock(e.dataTransfer);
    setActiveDragBlock(null);
    if (!blockName || !(blockName in catalog)) {
      return;
    }
    // biome-ignore lint/style/noNonNullAssertion: guarded by `in` check above
    const metadata = catalog[blockName]!;
    const [x, y] = screenToModelCoords(e.clientX, e.clientY, rect, pan, zoom, grid);
    insertAtPosition(metadata, [x, y]);
    useLibraryStore.getState().markRecentlyUsed(metadata.name);
  };

  return (
    <div
      ref={outerRef}
      className="canvas-flow"
      data-canvas-bg={canvasBackground}
      onDragOverCapture={handleDragOver}
      onDragOver={handleDragOver}
      onDropCapture={handleDrop}
    >
      {/* Shared SVG marker defs, rendered once regardless of how many wires exist —
          `url(#...)` references resolve document-wide, not just within the enclosing
          <svg>, so every WireEdge's `markerEnd` can point here. `fill="context-stroke"`
          makes the arrowhead follow each wire's own (possibly user-customized) stroke
          color automatically instead of needing one marker per color. */}
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <marker
            id="gensim-signal-arrow"
            viewBox="0 0 8 8"
            markerWidth={16}
            markerHeight={16}
            refX={7}
            refY={4}
            orient="auto-start-reverse"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="context-stroke" />
          </marker>
        </defs>
      </svg>
      <ReactFlowProvider>
        <CanvasSurface />
      </ReactFlowProvider>
    </div>
  );
}

export default Canvas;
