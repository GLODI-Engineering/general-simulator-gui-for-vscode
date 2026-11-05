import { createBlockFromMetadata } from "../library/insert";
import type { Block, BlockMetadata, Model, SubsystemPort, Wire } from "../model/types";
import { deriveBoundaryPorts } from "../store/model";

export interface GroupedSubsystem {
  /** New parent-model blocks: grouped blocks removed, the subsystem block added. */
  blocks: Block[];
  /** New parent-model wires: inner wires removed, crossing wires rewired to ports. */
  wires: Wire[];
  /** Id of the created subsystem block (the natural post-group selection). */
  subsystemId: string;
}

const INPORT_TYPE = "hierarchy.inport";
const OUTPORT_TYPE = "hierarchy.outport";

/**
 * Group the blocks in `ids` into a virtual subsystem.
 *
 * - Wires fully inside the group move into the subsystem body.
 * - Wires crossing the group boundary are *preserved*: a hierarchy.inport /
 *   hierarchy.outport boundary block is synthesized inside the subsystem, an
 *   inner wire connects it to the in-group endpoint, and the external wire is
 *   rewired to the matching boundary port on the parent-side subsystem block.
 *   Multiple external wires to the same inner port share one boundary port, so
 *   the net is preserved.
 *
 * Returns null when there are fewer than two grouped blocks, or when boundary
 * wires exist but the inport/outport catalog metadata is unavailable.
 */
export function groupBlocksIntoSubsystem(
  active: Model,
  ids: string[],
  catalog: Record<string, BlockMetadata>,
): GroupedSubsystem | null {
  const groupedSet = new Set(ids);
  const grouped = active.blocks.filter((block) => groupedSet.has(block.id));
  if (grouped.length < 2) {
    return null;
  }

  const innerWires = active.wires.filter(
    (wire) => groupedSet.has(wire.from.block) && groupedSet.has(wire.to.block),
  );
  const crossingWires = active.wires.filter(
    (wire) => groupedSet.has(wire.from.block) !== groupedSet.has(wire.to.block),
  );
  const outsideWires = active.wires.filter(
    (wire) => !groupedSet.has(wire.from.block) && !groupedSet.has(wire.to.block),
  );

  const inportMeta = catalog[INPORT_TYPE];
  const outportMeta = catalog[OUTPORT_TYPE];
  if (crossingWires.length > 0 && (!inportMeta || !outportMeta)) {
    return null;
  }

  const minX = Math.min(...grouped.map((b) => b.position[0]));
  const minY = Math.min(...grouped.map((b) => b.position[1]));
  const maxX = Math.max(...grouped.map((b) => b.position[0]));

  const subsystemId = `subsystem-${crypto.randomUUID()}`;
  const innerBlocks: Block[] = structuredClone(grouped);
  const subsystemWires: Wire[] = structuredClone(innerWires);

  // One boundary port per (direction, inner endpoint). Multiple external wires
  // landing on the same inner port reuse the same port, preserving the net.
  const boundaryByInner = new Map<string, string>();
  const rewrittenCrossing: Wire[] = [];
  let inCount = 0;
  let outCount = 0;
  let inY = minY;
  let outY = minY;

  for (const wire of crossingWires) {
    const fromInGroup = groupedSet.has(wire.from.block);
    const innerEndpoint = fromInGroup ? wire.from : wire.to;
    // Inner endpoint is the wire source → signal leaves the group → outport.
    // Inner endpoint is the wire sink → signal enters the group → inport.
    const direction: "in" | "out" = fromInGroup ? "out" : "in";
    const key = `${direction}:${innerEndpoint.block}:${innerEndpoint.port}`;

    let portId = boundaryByInner.get(key);
    if (portId === undefined) {
      if (direction === "in") {
        portId = `in${++inCount}`;
        // biome-ignore lint/style/noNonNullAssertion: guarded by the crossing check above
        const boundary = createBlockFromMetadata(inportMeta!, [minX - 100, inY]);
        boundary.params = { ...boundary.params, id: portId, kind: wire.kind };
        boundary.label = portId;
        inY += 60;
        innerBlocks.push(boundary);
        subsystemWires.push({
          id: `wire-${crypto.randomUUID()}`,
          from: { block: boundary.id, port: "out" },
          to: { block: innerEndpoint.block, port: innerEndpoint.port },
          waypoints: [],
          pinned: false,
          net: null,
          kind: wire.kind,
        });
      } else {
        portId = `out${++outCount}`;
        // biome-ignore lint/style/noNonNullAssertion: guarded by the crossing check above
        const boundary = createBlockFromMetadata(outportMeta!, [maxX + 100, outY]);
        boundary.params = { ...boundary.params, id: portId, kind: wire.kind };
        boundary.label = portId;
        outY += 60;
        innerBlocks.push(boundary);
        subsystemWires.push({
          id: `wire-${crypto.randomUUID()}`,
          from: { block: innerEndpoint.block, port: innerEndpoint.port },
          to: { block: boundary.id, port: "in" },
          waypoints: [],
          pinned: false,
          net: null,
          kind: wire.kind,
        });
      }
      boundaryByInner.set(key, portId);
    }

    // Rewire the parent wire so the in-group endpoint targets the subsystem
    // block's boundary port; the external endpoint is untouched.
    const endpoint = { block: subsystemId, port: portId };
    rewrittenCrossing.push(
      fromInGroup
        ? { ...wire, from: endpoint, waypoints: [] }
        : { ...wire, to: endpoint, waypoints: [] },
    );
  }

  const ports: SubsystemPort[] = deriveBoundaryPorts(innerBlocks);

  const subsystem: Model = {
    id: `${subsystemId}-inner`,
    name: "Subsystem",
    grid: active.grid,
    params: [],
    blocks: innerBlocks,
    wires: subsystemWires,
    lines: [],
    nets: [],
    simulation: {},
    metadata: {},
    ports,
    parent_param_aliases: [],
  };

  const subsystemBlock: Block = {
    id: subsystemId,
    type: "hierarchy.subsystem.virtual",
    paradigm: "hierarchy",
    domain: "signal",
    fidelity: "n_a",
    position: [minX, minY],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
    label: "Subsystem",
    subsystem,
  };

  return {
    blocks: [...active.blocks.filter((block) => !groupedSet.has(block.id)), subsystemBlock],
    wires: [...outsideWires, ...rewrittenCrossing],
    subsystemId,
  };
}
