import type { Block, BlockMetadata, Wire } from "../model/types";
import { getMetadataPortCenters } from "./nodes/port-hit-test";
import { resolveBlockPorts } from "./nodes/resolve-ports";
import { type StructuredSubcktDef, resolveBlockMetadata } from "./subckt-metadata";

export interface TopologyPortRef {
  blockId: string;
  portId: string;
  direction: "in" | "out" | "inout";
  kind: string;
}

export interface TopologyNode {
  id: string;
  point: [number, number];
  ports: TopologyPortRef[];
  wireIds: string[];
}

export interface TopologyNet {
  id: string;
  nodeIds: string[];
  wireIds: string[];
  ports: TopologyPortRef[];
}

export interface TopologyIssue {
  id: string;
  severity: "error" | "warning" | "info";
  summary: string;
  blockId?: string;
  portId?: string;
}

export interface TopologyResult {
  nodes: TopologyNode[];
  nets: TopologyNet[];
  issues: TopologyIssue[];
}

type Catalog = Record<string, BlockMetadata>;

function pointKey([x, y]: [number, number]): string {
  return `${Math.round(x)},${Math.round(y)}`;
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function portKey(port: TopologyPortRef): string {
  return `${port.blockId}:${port.portId}`;
}

function getJunctionPortRef(block: Block, portId: string): TopologyPortRef | null {
  if (block.type !== "routing.junction" || portId !== "node") return null;
  return { blockId: block.id, portId, direction: "inout", kind: block.domain };
}

function getPortRef(metadata: BlockMetadata, block: Block, portId: string): TopologyPortRef | null {
  const blockId = block.id;
  const resolved = resolveBlockPorts(metadata, block.params);
  const input = resolved.inputs.find((port) => port.id === portId);
  const output = resolved.outputs.find((port) => port.id === portId);
  const port = input ?? output;
  if (!port) return null;
  return {
    blockId,
    portId,
    direction: input ? "in" : output ? "out" : "inout",
    kind: port.kind.domain,
  };
}

function addNodePoint(
  nodeMap: Map<
    string,
    { point: [number, number]; ports: Map<string, TopologyPortRef>; wireIds: Set<string> }
  >,
  point: [number, number],
  update: (node: { ports: Map<string, TopologyPortRef>; wireIds: Set<string> }) => void,
): void {
  const key = pointKey(point);
  const node = nodeMap.get(key) ?? {
    point,
    ports: new Map<string, TopologyPortRef>(),
    wireIds: new Set<string>(),
  };
  update(node);
  nodeMap.set(key, node);
}

class DisjointSet {
  private parent = new Map<string, string>();

  add(value: string): void {
    if (!this.parent.has(value)) this.parent.set(value, value);
  }

  find(value: string): string {
    const parent = this.parent.get(value);
    if (!parent || parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(left: string, right: string): void {
    this.add(left);
    this.add(right);
    const rootLeft = this.find(left);
    const rootRight = this.find(right);
    if (rootLeft === rootRight) return;
    const sorted = [rootLeft, rootRight].sort((a, b) => a.localeCompare(b));
    const winner = sorted[0];
    const loser = sorted[1];
    if (!winner || !loser) return;
    this.parent.set(loser, winner);
  }

  groups(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const value of this.parent.keys()) {
      const root = this.find(value);
      groups.set(root, [...(groups.get(root) ?? []), value]);
    }
    return groups;
  }
}

export function deriveTopology(
  blocks: Block[],
  wires: Wire[],
  catalog: Catalog,
  subcktDefs?: StructuredSubcktDef[] | null,
): TopologyResult {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const nodeMap = new Map<
    string,
    { point: [number, number]; ports: Map<string, TopologyPortRef>; wireIds: Set<string> }
  >();
  const wireNodeKeys = new Map<string, string[]>();

  for (const wire of wires) {
    const fromBlock = blockById.get(wire.from.block);
    const toBlock = blockById.get(wire.to.block);
    const fromMetadata = fromBlock
      ? (resolveBlockMetadata(fromBlock, catalog, subcktDefs) ?? undefined)
      : undefined;
    const toMetadata = toBlock
      ? (resolveBlockMetadata(toBlock, catalog, subcktDefs) ?? undefined)
      : undefined;
    const fromCenter =
      fromBlock?.type === "routing.junction"
        ? { x: fromBlock.position[0], y: fromBlock.position[1] }
        : fromBlock && fromMetadata
          ? getMetadataPortCenters(fromBlock, fromMetadata).find(
              (port) => port.id === wire.from.port,
            )?.stubTip
          : undefined;
    const toCenter =
      toBlock?.type === "routing.junction"
        ? { x: toBlock.position[0], y: toBlock.position[1] }
        : toBlock && toMetadata
          ? getMetadataPortCenters(toBlock, toMetadata).find((port) => port.id === wire.to.port)
              ?.stubTip
          : undefined;

    const points: Array<[number, number]> = [
      fromCenter ? [Math.round(fromCenter.x), Math.round(fromCenter.y)] : undefined,
      ...wire.waypoints,
      toCenter ? [Math.round(toCenter.x), Math.round(toCenter.y)] : undefined,
    ].filter((point): point is [number, number] => point !== undefined);

    const nodeKeys: string[] = [];
    for (const point of points) {
      const key = pointKey(point);
      nodeKeys.push(key);
      addNodePoint(nodeMap, point, (node) => node.wireIds.add(wire.id));
    }

    if (fromBlock && points[0]) {
      const ref =
        getJunctionPortRef(fromBlock, wire.from.port) ??
        (fromMetadata ? getPortRef(fromMetadata, fromBlock, wire.from.port) : null);
      if (ref) addNodePoint(nodeMap, points[0], (node) => node.ports.set(portKey(ref), ref));
    }
    const last = points.at(-1);
    if (toBlock && last) {
      const ref =
        getJunctionPortRef(toBlock, wire.to.port) ??
        (toMetadata ? getPortRef(toMetadata, toBlock, wire.to.port) : null);
      if (ref) addNodePoint(nodeMap, last, (node) => node.ports.set(portKey(ref), ref));
    }

    wireNodeKeys.set(wire.id, sortedUnique(nodeKeys));
  }

  const dsu = new DisjointSet();
  for (const wire of wires) {
    dsu.add(wire.id);
  }
  for (const node of nodeMap.values()) {
    const wireIds = [...node.wireIds];
    for (let index = 1; index < wireIds.length; index += 1) {
      const first = wireIds[0];
      const next = wireIds[index];
      if (first && next) dsu.union(first, next);
    }
  }

  const nodes: TopologyNode[] = [...nodeMap.entries()]
    .map(([id, node]) => ({
      id,
      point: node.point,
      ports: [...node.ports.values()].sort((left, right) =>
        portKey(left).localeCompare(portKey(right)),
      ),
      wireIds: sortedUnique(node.wireIds),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const nodeByWire = new Map<string, string[]>();
  for (const [wireId, nodeIds] of wireNodeKeys) {
    nodeByWire.set(wireId, nodeIds);
  }

  const nets: TopologyNet[] = [...dsu.groups().entries()]
    .map(([root, wireIds]) => {
      const sortedWireIds = sortedUnique(wireIds);
      const nodeIds = sortedUnique(sortedWireIds.flatMap((wireId) => nodeByWire.get(wireId) ?? []));
      const ports = nodeIds
        .flatMap((nodeId) => nodes.find((node) => node.id === nodeId)?.ports ?? [])
        .sort((left, right) => portKey(left).localeCompare(portKey(right)));
      return { id: `net-${root}`, nodeIds, wireIds: sortedWireIds, ports };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return { nodes, nets, issues: deriveTopologyIssues(nets) };
}

/**
 * Wire endpoints that name a port their block does not have.
 *
 * This is not refused anywhere: the renderer falls back to a position and
 * draws the wire somewhere plausible, so the sheet looks connected. Whether
 * the result leaves a diagonal — and therefore shows as an invalid wire — is
 * luck. On a 68-block converter this hid twenty-seven bad endpoints and
 * eighteen wires that were never drawn at all; the output filter looked like
 * loose components sitting beside the circuit, and read as a cosmetic
 * routing problem rather than as a quarter of the connections being absent.
 *
 * Checked against the ports a block *declares*, with one exception that
 * matters: several components generate their ports from a parameter —
 * `control.sum` from `signs`, `extensibility.octfunc` from its input and
 * output counts — and declare only the first in their metadata. Reporting
 * those would bury the real findings under dozens of false ones, so a block
 * whose port count is parameter-driven is skipped rather than guessed at.
 * A subcircuit instance takes its ports from its own sheet, which is not
 * available here, and is skipped for the same reason.
 */
export function findUnknownPortRefs(
  model: { blocks: Array<{ id: string; type: string }>; wires: Wire[] },
  catalog: Catalog,
): TopologyIssue[] {
  const byId = new Map(model.blocks.map((block) => [block.id, block]));
  const issues: TopologyIssue[] = [];

  for (const wire of model.wires) {
    for (const side of ["from", "to"] as const) {
      const end = wire[side];
      const block = byId.get(end.block);
      if (!block) {
        issues.push({
          id: `unknown-block:${wire.id}:${side}`,
          severity: "error",
          summary: `Wire ${wire.id} ${side} names block "${end.block}", which is not on the sheet`,
        });
        continue;
      }
      const metadata = catalog[block.type];
      if (!metadata || hasGeneratedPorts(metadata, block.type)) continue;

      const declared = declaredPortIds(metadata);
      if (declared.size === 0 || declared.has(end.port)) continue;

      issues.push({
        id: `unknown-port:${wire.id}:${side}`,
        severity: "error",
        summary:
          `Wire ${wire.id} ${side} names port "${end.port}" on ${end.block} ` +
          `(${block.type}), which has no such port — it has: ${[...declared].join(", ")}`,
        blockId: end.block,
        portId: end.port,
      });
    }
  }

  return issues.sort((left, right) => left.id.localeCompare(right.id));
}

function declaredPortIds(metadata: BlockMetadata): Set<string> {
  const ports = metadata.ports ?? { inputs: [], outputs: [] };
  return new Set([...(ports.inputs ?? []), ...(ports.outputs ?? [])].map((port) => port.id));
}

/**
 * True when this component's ports come from a parameter rather than from
 * its metadata, so the declared list is a lower bound and not a contract.
 *
 * The schema says so itself: `variadic_inputs`/`variadic_outputs` carry a
 * `count_from` naming the parameter that decides how many there are, and a
 * template for each. `control.sum` counts from `signs`,
 * `extensibility.octfunc` from its input and output counts. Reporting those
 * would bury the real findings under dozens of false ones.
 */
function hasGeneratedPorts(metadata: BlockMetadata, type: string): boolean {
  // A subcircuit instance takes its ports from its own sheet, which is not
  // available here.
  if (type.includes("instance")) return true;
  const ports = metadata.ports;
  return Boolean(ports?.variadic_inputs ?? ports?.variadic_outputs);
}

export function deriveTopologyIssues(nets: TopologyNet[]): TopologyIssue[] {
  const issues: TopologyIssue[] = [];
  for (const net of nets) {
    const drivenInputs = net.ports.filter(
      (port) => port.kind === "signal" && port.direction === "in",
    );
    const drivers = net.ports.filter((port) => port.kind === "signal" && port.direction === "out");
    if (drivers.length > 1) {
      for (const port of drivenInputs) {
        issues.push({
          id: `signal-fanin:${port.blockId}:${port.portId}`,
          severity: "error",
          summary: `Signal input ${port.blockId}.${port.portId} has multiple drivers`,
          blockId: port.blockId,
          portId: port.portId,
        });
      }
    }
  }
  return issues.sort((left, right) => left.id.localeCompare(right.id));
}

export function topologySummary(topology: TopologyResult): string {
  return JSON.stringify({ nodes: topology.nodes, nets: topology.nets, issues: topology.issues });
}
