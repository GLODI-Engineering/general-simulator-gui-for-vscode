import { create } from "zustand";

import { getMetadataPortCenters, SYMBOL_SCALE } from "../canvas/nodes/port-hit-test";
import { resolveBlockBbox } from "../canvas/nodes/resolve-ports";
import { rerouteEndSegment } from "../canvas/router/attachment";
import { type RouterComponent, getObstacles } from "../canvas/router/obstacles";
import {
  GRID,
  type RouteSegment,
  pointsToSegments,
  routeBlocked,
  simplifyPts,
  routeOrtho,
  routeOverlap,
} from "../canvas/router/ortho-route";
import { netOf } from "../canvas/edges/junctions";
import { resolveBlockMetadata } from "../canvas/subckt-metadata";
import { emit as emitAutosave } from "../file/autosave";
import { type SwapResult, swap as swapFidelity } from "../library/fidelity-swap";
import type {
  Annotation,
  Block,
  Mirror,
  ModelDocument,
  ParamValue,
  Rotation,
  Simulation,
  Wire,
} from "../model/types";

import {
  type GraphDiffFrame,
  type GraphSnapshot,
  cloneGraphSnapshot,
  diffHasChanges,
} from "./graph-diff";
import { useLibraryStore } from "./library";
import { resolveModelAtPath } from "./model";

function invariantInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
}

function invariantPoint(point: [number, number], label: string): void {
  invariantInteger(point[0], `${label}[0]`);
  invariantInteger(point[1], `${label}[1]`);
}

function snapshotFromDocument(model: ModelDocument["model"]): GraphSnapshot {
  return {
    blocks: Object.fromEntries(model.blocks.map((block) => [block.id, structuredClone(block)])),
    wires: Object.fromEntries(model.wires.map((wire) => [wire.id, structuredClone(wire)])),
    model: structuredClone(model),
  };
}

function documentFromSnapshot(snapshot: GraphSnapshot): ModelDocument["model"] {
  return {
    ...structuredClone(snapshot.model),
    blocks: Object.values(snapshot.blocks),
    wires: Object.values(snapshot.wires),
  };
}

type ModelGraph = ModelDocument["model"];

function portCenterForWireEndpoint(
  model: ModelGraph,
  endpoint: { block: string; port: string },
): [number, number] | null {
  const block = model.blocks.find((candidate) => candidate.id === endpoint.block);
  if (!block) return null;
  if (block.type === "routing.junction") return block.position;
  const metadata = resolveBlockMetadata(
    block,
    useLibraryStore.getState().catalog,
    model.subckt_defs,
  );
  const center = metadata
    ? getMetadataPortCenters(block, metadata).find((port) => port.id === endpoint.port)?.stubTip
    : null;
  return center ? [Math.round(center.x), Math.round(center.y)] : block.position;
}

/**
 * The axis a wire must leave (or arrive at) this endpoint along: the port's own
 * facing direction after mirror+rotation. Junctions and unknown ports have no
 * facing, so they fall back to the router's own heuristics.
 */
/**
 * The *face* a port leaves by, after mirror and rotation.
 *
 * `portExitDirForWireEndpoint` below reduces this to an axis, which is all the
 * router's `Direction` can carry -- and an axis cannot distinguish "leaves
 * upward" from "leaves downward". That is how a wire came to approach a
 * top-facing port from underneath, cutting through the symbol to reach it:
 * arriving vertically was all that was being asked for. On a back-to-back
 * switch pair it hit only the mirrored device, because only there was the
 * wrong-side approach the shorter of the two.
 */
function portExitSideForWireEndpoint(
  model: ModelGraph,
  endpoint: { block: string; port: string },
): "left" | "right" | "top" | "bottom" | null {
  const block = model.blocks.find((candidate) => candidate.id === endpoint.block);
  if (!block || block.type === "routing.junction") return null;
  const metadata = resolveBlockMetadata(
    block,
    useLibraryStore.getState().catalog,
    model.subckt_defs,
  );
  if (!metadata) return null;
  return (
    getMetadataPortCenters(block, metadata).find((port) => port.id === endpoint.port)
      ?.rotatedSide ?? null
  );
}

/** One grid step further out along the port's own facing. */
function approachPoint(
  point: [number, number],
  side: "left" | "right" | "top" | "bottom" | null,
): [number, number] {
  const step = GRID;
  switch (side) {
    case "left":
      return [point[0] - step, point[1]];
    case "right":
      return [point[0] + step, point[1]];
    case "top":
      return [point[0], point[1] - step];
    case "bottom":
      return [point[0], point[1] + step];
    default:
      return point;
  }
}

function portExitDirForWireEndpoint(
  model: ModelGraph,
  endpoint: { block: string; port: string },
): "h" | "v" | null {
  const block = model.blocks.find((candidate) => candidate.id === endpoint.block);
  if (!block || block.type === "routing.junction") return null;
  const metadata = resolveBlockMetadata(
    block,
    useLibraryStore.getState().catalog,
    model.subckt_defs,
  );
  if (!metadata) return null;
  return (
    getMetadataPortCenters(block, metadata).find((port) => port.id === endpoint.port)?.exitDir ??
    null
  );
}

/**
 * Recompute orthogonal waypoints for every wire incident to a touched block,
 * operating on the supplied model graph (which may be a subsystem submodel).
 * Wires that are pinned, untouched, or reference a missing block are left as-is
 * so a dangling endpoint never snaps the wire to the canvas origin.
 */
function modelToRouterComponents(model: ModelGraph): RouterComponent[] {
  const catalog = useLibraryStore.getState().catalog;
  const subcktDefs = model.subckt_defs;
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
    // `resolveBlockBbox` (not the raw `metadata.symbol.bbox`) so a variadic-port
    // block's grown footprint is an obstacle too, not just its static declared size.
    // Both need `* SYMBOL_SCALE`: block/port/wire coordinates are already in scaled
    // model space (see getMetadataPortCenters below, and BlockNode.tsx's own `width`),
    // but this size was being read in raw pre-scale symbol units and handed straight
    // to the router — every obstacle box was undersized by exactly 1.6x, so the
    // "obstacle avoidance" router was correctly avoiding a box far smaller than what
    // is actually drawn, and wires routed straight through the visible symbol body.
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

/**
 * Continuation bias read off the wire's own first waypoint. Only consulted when
 * the source port has no known facing — right after the owning block moved this
 * waypoint is stale, so a real port facing always wins over it.
 */
function inferRouteDir(from: [number, number], wire: Wire): "h" | "v" | null {
  const first = wire.waypoints[0];
  if (!first) {
    return null;
  }
  return from[0] === first[0] ? "v" : "h";
}

function isOrthogonal(points: Array<[number, number]>): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (!current || !next) {
      return false;
    }
    if (current[0] !== next[0] && current[1] !== next[1]) {
      return false;
    }
  }
  return true;
}

export function rerouteWiresForBlocks(model: ModelGraph, touchedBlockIds: Set<string>): void {
  const obstacles = modelToRouterComponents(model);

  // Which net each wire belongs to, by the same rule the junction dots use:
  // wires sharing a (block, port) endpoint, or an explicit net name, are one
  // conductor. Two wires of one net may share a run -- that is a trunk with
  // branches -- so only cross-net overlap is avoided.
  const nets = netOf(model.wires);
  const netById = new Map(model.wires.map((wire, index) => [wire.id, nets[index]]));

  // Runs already taken. Wires this pass is not touching keep their drawn path,
  // so a rerouted wire avoids them; each wire this pass routes is added as it
  // goes, so a bundle fans out instead of stacking on one line.
  const occupied: RouteSegment[] = [];
  for (const wire of model.wires) {
    const fromMoved = touchedBlockIds.has(wire.from.block);
    const toMoved = touchedBlockIds.has(wire.to.block);
    if (!wire.pinned && (fromMoved || toMoved)) continue;
    const from = portCenterForWireEndpoint(model, wire.from);
    const to = portCenterForWireEndpoint(model, wire.to);
    if (!from || !to) continue;
    occupied.push(...pointsToSegments([from, ...wire.waypoints, to], netById.get(wire.id)));
  }

  model.wires = model.wires.map((wire) => {
    const fromMoved = touchedBlockIds.has(wire.from.block);
    const toMoved = touchedBlockIds.has(wire.to.block);
    if (wire.pinned || (!fromMoved && !toMoved)) {
      return wire;
    }

    const from = portCenterForWireEndpoint(model, wire.from);
    const to = portCenterForWireEndpoint(model, wire.to);
    if (!from || !to) {
      return wire;
    }

    const wireObstacles = getObstacles(obstacles, from[0], from[1], to[0], to[1]);
    let points: Array<[number, number]> = [from, ...wire.waypoints, to].map(([x, y]) => [
      Math.round(x),
      Math.round(y),
    ]);

    const fromDir = portExitDirForWireEndpoint(model, wire.from);
    const toDir = portExitDirForWireEndpoint(model, wire.to);
    const net = netById.get(wire.id);

    // A wire with no waypoints of its own has never been routed, so route it
    // whole rather than patching its ends. Routing runs between *approach*
    // points -- one step out along each port's own facing -- and the port
    // points are put back afterwards. That is what stops a wire reaching a
    // port from the wrong side: the last thing it does is come in along the
    // port's own normal, so it cannot arrive through the body behind it. The
    // leading and trailing segments still run along the port's axis, which is
    // the property FE-20 pins.
    if (fromMoved && toMoved && wire.waypoints.length === 0) {
      const fromSide = portExitSideForWireEndpoint(model, wire.from);
      const toSide = portExitSideForWireEndpoint(model, wire.to);
      const fa = approachPoint(points[0] as [number, number], fromSide);
      const ta = approachPoint(points[points.length - 1] as [number, number], toSide);
      const middle = routeOrtho(
        fa[0],
        fa[1],
        ta[0],
        ta[1],
        fromDir ?? inferRouteDir(from, wire),
        wireObstacles,
        toDir,
        { occupied, net },
      );
      const whole = simplifyPts([from, ...middle, to]);
      if (isOrthogonal(whole)) {
        occupied.push(...pointsToSegments(whole, net));
        return { ...wire, waypoints: whole.slice(1, -1) };
      }
    }

    if (fromMoved) {
      points = rerouteEndSegment(points, "first", wireObstacles, fromDir);
    }
    if (toMoved) {
      points = rerouteEndSegment(points, "last", wireObstacles, toDir);
    }

    if (!isOrthogonal(points)) {
      points = routeOrtho(
        from[0],
        from[1],
        to[0],
        to[1],
        fromDir ?? inferRouteDir(from, wire),
        wireObstacles,
        toDir,
        { occupied, net },
      );
    } else if (routeOverlap(points, occupied, net) > 0 || routeBlocked(points, wireObstacles)) {
      // `rerouteEndSegment` already produced a legal *orthogonal* path, so the
      // full router was never consulted -- and on load that is every wire,
      // which is how a sheet ends up both with bundles drawn on one line and
      // with wires crossing straight through components. Orthogonal was the
      // only thing being checked here; neither obstacles nor other wires were.
      // Ask for a route that dodges both, and keep it only if it is better.
      const alternative = routeOrtho(
        from[0],
        from[1],
        to[0],
        to[1],
        fromDir ?? inferRouteDir(from, wire),
        wireObstacles,
        toDir,
        { occupied, net },
      );
      // Score both the same way the router does: a wire through a component is
      // worse than any amount of running alongside another wire.
      const cost = (pts: Array<[number, number]>) =>
        (routeBlocked(pts, wireObstacles) ? 1e6 : 0) + routeOverlap(pts, occupied, net);
      if (isOrthogonal(alternative) && cost(alternative) < cost(points)) {
        points = alternative;
      }
    }

    occupied.push(...pointsToSegments(points, net));
    return { ...wire, waypoints: points.slice(1, -1) };
  });
}

function createEmptyModel(): ModelDocument {
  return {
    schema_version: 2,
    model: {
      id: "model-1",
      name: "Untitled model",
      grid: 10,
      params: [],
      blocks: [],
      wires: [],
      lines: [],
      nets: [],
      simulation: {},
      metadata: {},
    },
  };
}

export interface GraphStoreState {
  document: ModelDocument;
  undoStack: GraphDiffFrame[];
  redoStack: GraphDiffFrame[];
  isTransacting: boolean;
  transact: (name: string, fn: () => void) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  loadDocument: (document: ModelDocument) => void;
  addBlock: (block: Block) => void;
  moveBlocks: (ids: string[], delta: [number, number]) => void;
  rotateBlocks: (ids: string[], dir: "cw" | "ccw") => void;
  mirrorBlocks: (ids: string[], axis: "x" | "y") => void;
  deleteBlocks: (ids: string[]) => void;
  addWire: (wire: Wire) => void;
  rerouteWire: (id: string, waypoints: Array<[number, number]>) => void;
  deleteWires: (ids: string[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  moveAnnotation: (id: string, delta: [number, number]) => void;
  setParam: (blockId: string, key: string, value: ParamValue) => void;
  setModelParams: (
    params: Array<{ name: string; value: ParamValue; unit?: string; doc?: string }>,
  ) => void;
  deleteAnnotations: (ids: string[]) => void;
  setSimulation: (simulation: Simulation) => void;
  swapFidelity: (blockId: string, newFidelity: string) => SwapResult;
  mutateModelAtPath: (path: string[], mutate: (model: ModelDocument["model"]) => void) => void;
}

function requireTransaction(state: GraphStoreState): void {
  if (import.meta.env.DEV && !state.isTransacting) {
    throw new Error("Graph mutations must run inside transact()");
  }
}

function withDocumentMutation(
  state: GraphStoreState,
  mutate: (document: ModelDocument) => void,
): Partial<GraphStoreState> {
  requireTransaction(state);
  const document = structuredClone(state.document);
  mutate(document);
  return { document };
}

export const useGraphStore = create<GraphStoreState>((set, get) => ({
  document: createEmptyModel(),
  undoStack: [],
  redoStack: [],
  isTransacting: false,
  transact: (name, fn) => {
    const before = snapshotFromDocument(get().document.model);
    set({ isTransacting: true });
    try {
      fn();
    } finally {
      set({ isTransacting: false });
    }
    const after = snapshotFromDocument(get().document.model);
    if (!diffHasChanges(before, after)) {
      return;
    }
    set((state) => ({
      undoStack: [
        ...state.undoStack,
        { name, before: cloneGraphSnapshot(before), after: cloneGraphSnapshot(after) },
      ],
      redoStack: [],
    }));
    emitAutosave("commit");
  },
  undo: () => {
    const state = get();
    const frame = state.undoStack.at(-1);
    if (!frame) {
      return;
    }
    set({
      document: { schema_version: 2, model: documentFromSnapshot(frame.before) },
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, frame],
    });
  },
  redo: () => {
    const state = get();
    const frame = state.redoStack.at(-1);
    if (!frame) {
      return;
    }
    set({
      document: { schema_version: 2, model: documentFromSnapshot(frame.after) },
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, frame],
    });
  },
  clearHistory: () => {
    set({ undoStack: [], redoStack: [] });
  },
  loadDocument: (document) => {
    const snapshot = snapshotFromDocument(document.model);
    for (const block of Object.values(snapshot.blocks)) {
      invariantPoint(block.position, `block ${block.id} position`);
    }
    for (const wire of Object.values(snapshot.wires)) {
      for (const [index, waypoint] of wire.waypoints.entries()) {
        invariantPoint(waypoint, `wire ${wire.id} waypoints[${index}]`);
      }
    }

    const normalized = structuredClone(document);
    if (normalized.model.blocks.length > 0 && normalized.model.wires.length > 0) {
      rerouteWiresForBlocks(
        normalized.model,
        new Set(normalized.model.blocks.map((block) => block.id)),
      );
    }

    set({
      document: normalized,
      undoStack: [],
      redoStack: [],
      isTransacting: false,
    });
  },
  addBlock: (block) => {
    invariantPoint(block.position, `block ${block.id} position`);
    set((state) =>
      withDocumentMutation(state, (document) => {
        document.model.blocks.push(structuredClone(block));
      }),
    );
  },
  moveBlocks: (ids, delta) => {
    invariantPoint(delta, "move delta");
    set((state) =>
      withDocumentMutation(state, (document) => {
        const idSet = new Set(ids);
        document.model.blocks = document.model.blocks.map((block) => {
          if (!idSet.has(block.id)) {
            return block;
          }
          const position: [number, number] = [
            block.position[0] + delta[0],
            block.position[1] + delta[1],
          ];
          invariantPoint(position, `block ${block.id} position`);
          return { ...block, position };
        });
        rerouteWiresForBlocks(document.model, idSet);
      }),
    );
  },
  rotateBlocks: (ids, dir) => {
    const turns: Rotation[] = [0, 90, 180, 270];
    set((state) =>
      withDocumentMutation(state, (document) => {
        const idSet = new Set(ids);
        document.model.blocks = document.model.blocks.map((block) => {
          if (!idSet.has(block.id)) {
            return block;
          }
          const index = turns.indexOf(block.rotation);
          if (index === -1) {
            throw new Error(`Unsupported rotation ${block.rotation} for block ${block.id}`);
          }
          const nextIndex =
            dir === "cw" ? (index + 1) % turns.length : (index + turns.length - 1) % turns.length;
          const rotation = turns[nextIndex];
          if (rotation === undefined) {
            throw new Error(`Rotation lookup failed for block ${block.id}`);
          }
          return { ...block, rotation };
        });
        rerouteWiresForBlocks(document.model, idSet);
      }),
    );
  },
  mirrorBlocks: (ids, axis) => {
    const nextMirror = (current: Mirror): Mirror => {
      if (axis === "x") {
        return current === "x" ? "none" : "x";
      }
      return current === "y" ? "none" : "y";
    };
    set((state) =>
      withDocumentMutation(state, (document) => {
        const idSet = new Set(ids);
        document.model.blocks = document.model.blocks.map((block) =>
          idSet.has(block.id) ? { ...block, mirror: nextMirror(block.mirror) } : block,
        );
        rerouteWiresForBlocks(document.model, idSet);
      }),
    );
  },
  deleteBlocks: (ids) => {
    set((state) =>
      withDocumentMutation(state, (document) => {
        const idSet = new Set(ids);
        document.model.blocks = document.model.blocks.filter((block) => !idSet.has(block.id));
        document.model.wires = document.model.wires.filter(
          (wire) => !idSet.has(wire.from.block) && !idSet.has(wire.to.block),
        );
      }),
    );
  },
  addWire: (wire) => {
    for (const [index, waypoint] of wire.waypoints.entries()) {
      invariantPoint(waypoint, `wire ${wire.id} waypoints[${index}]`);
    }
    set((state) =>
      withDocumentMutation(state, (document) => {
        document.model.wires.push(structuredClone(wire));
      }),
    );
  },
  rerouteWire: (id, waypoints) => {
    for (const [index, waypoint] of waypoints.entries()) {
      invariantPoint(waypoint, `wire ${id} waypoints[${index}]`);
    }
    set((state) =>
      withDocumentMutation(state, (document) => {
        document.model.wires = document.model.wires.map((wire) =>
          wire.id === id ? { ...wire, waypoints: structuredClone(waypoints) } : wire,
        );
      }),
    );
  },
  deleteWires: (ids) => {
    set((state) =>
      withDocumentMutation(state, (document) => {
        const idSet = new Set(ids);
        document.model.wires = document.model.wires.filter((wire) => !idSet.has(wire.id));
      }),
    );
  },
  addAnnotation: (annotation) => {
    set((state) =>
      withDocumentMutation(state, (document) => {
        document.model.lines.push(structuredClone(annotation));
      }),
    );
  },
  updateAnnotation: (id, patch) => {
    set((state) =>
      withDocumentMutation(state, (document) => {
        document.model.lines = document.model.lines.map((ann) =>
          ann.id === id ? ({ ...ann, ...structuredClone(patch) } as Annotation) : ann,
        );
      }),
    );
  },
  moveAnnotation: (id, delta) => {
    invariantPoint(delta, "annotation delta");
    set((state) =>
      withDocumentMutation(state, (document) => {
        document.model.lines = document.model.lines.map((ann) => {
          if (ann.id !== id) {
            return ann;
          }
          const position = ann.position ?? [0, 0];
          const nextPosition: [number, number] = [position[0] + delta[0], position[1] + delta[1]];
          invariantPoint(nextPosition, `annotation ${id} position`);
          return { ...ann, position: nextPosition };
        });
      }),
    );
  },
  setParam: (blockId, key, value) => {
    set((state) =>
      withDocumentMutation(state, (document) => {
        document.model.blocks = document.model.blocks.map((block) =>
          block.id === blockId
            ? { ...block, params: { ...block.params, [key]: structuredClone(value) } }
            : block,
        );
      }),
    );
  },
  setModelParams: (params) => {
    set((state) =>
      withDocumentMutation(state, (document) => {
        document.model.params = structuredClone(params) as typeof document.model.params;
      }),
    );
  },
  deleteAnnotations: (ids) => {
    set((state) =>
      withDocumentMutation(state, (document) => {
        const idSet = new Set(ids);
        document.model.lines = document.model.lines.filter((ann) => !idSet.has(ann.id));
      }),
    );
  },
  setSimulation: (simulation) => {
    set((state) =>
      withDocumentMutation(state, (document) => {
        document.model.simulation = structuredClone(simulation) as typeof document.model.simulation;
      }),
    );
  },
  swapFidelity: (blockId, newFidelity) => {
    let result: SwapResult | null = null;
    set((state) =>
      withDocumentMutation(state, (document) => {
        result = swapFidelity(blockId, newFidelity, document.model);
      }),
    );
    if (!result) {
      throw new Error("swapFidelity: expected swap result");
    }
    return result;
  },
  mutateModelAtPath: (path, mutate) => {
    set((state) =>
      withDocumentMutation(state, (document) => {
        const model = resolveModelAtPath(document.model, path);
        if (!model) {
          return;
        }
        mutate(model);
      }),
    );
  },
}));
