/**
 * FE-65: Signal-dimension propagation (spec §7.3)
 *
 * Resolves every signal-flow wire's dim from block port signatures.
 * Returns Map<wireId, dim> or a typed error.
 */

import { getPortSigs } from "../library/catalog-core";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Dim = number[];

export interface DimMismatchError {
  error: "dim-mismatch";
  wireId?: string;
  expected: Dim;
  actual: Dim;
}

export interface DimUnresolvedError {
  error: "dim-unresolved";
  wireIds?: string[];
}

export interface DimLoopError {
  error: "dim-loop";
  cycle: string[];
}

export type PropagateError = DimMismatchError | DimUnresolvedError | DimLoopError;

export type PropagateResult = Map<string, Dim> | PropagateError;

// ---------------------------------------------------------------------------
// Model stub type (mirrors the actual Model but without requiring all fields)
// ---------------------------------------------------------------------------

export interface ModelBlock {
  id: string;
  type: string;
  paradigm?: string;
  params?: Record<string, unknown> & { dim?: unknown };
  ports?: { id: string; dim?: string | number[] }[];
}

export interface ModelWire {
  id: string;
  from: { block: string; port: string };
  to: { block: string; port: string };
  kind?: string;
}

export interface PropagateModel {
  blocks: ModelBlock[];
  wires: ModelWire[];
}

// ---------------------------------------------------------------------------
// Acausal domains (no dim propagation)
// ---------------------------------------------------------------------------

const ACAUSAL_KINDS = new Set([
  "physical-electrical",
  "physical-translational",
  "physical-rotational",
  "physical-thermal",
  "electrical",
  "translational",
  "rotational",
  "thermal",
]);

function isAcausalWire(wire: ModelWire, blockMap: Map<string, ModelBlock>): boolean {
  if (wire.kind && ACAUSAL_KINDS.has(wire.kind)) return true;
  // If source block is a physical-network paradigm block, skip it
  const srcBlock = blockMap.get(wire.from.block);
  if (srcBlock?.paradigm && srcBlock.paradigm !== "signal-flow") return true;
  return false;
}

// ---------------------------------------------------------------------------
// shape(param) helper
// ---------------------------------------------------------------------------

function shapeOf(value: unknown): Dim {
  if (value === null || value === undefined) return [1];
  if (typeof value === "number") return [1];
  if (typeof value === "boolean") return [1];
  if (typeof value === "string") return [1];
  if (Array.isArray(value)) {
    if (value.length === 0) return [0];
    const first = value[0];
    if (Array.isArray(first)) {
      // matrix: rows × cols
      return [value.length, (first as unknown[]).length];
    }
    return [value.length];
  }
  return [1];
}

// ---------------------------------------------------------------------------
// Port sig resolution
// ---------------------------------------------------------------------------

type PortSigMap = Record<string, string>;

/**
 * Look up port signatures for a block type.
 * Falls back to a built-in registry for known types when catalog is unavailable.
 */
function resolvePortSigs(blockType: string): PortSigMap | null {
  // Try catalog first
  try {
    const sigs = getPortSigs(blockType);
    if (sigs) return sigs;
  } catch {
    // catalog not loaded yet (test environment)
  }
  // Built-in fallback for core signal-flow types (covers test stubs)
  return BUILTIN_PORT_SIGS[blockType] ?? null;
}

/** Minimal built-in registry so tests can run without the catalog */
const BUILTIN_PORT_SIGS: Record<string, PortSigMap> = {
  "signal-flow.source.constant": { out: "shape(value)" },
  "signal-flow.math.gain": { in: "inherit", out: "from(in)" },
  "signal-flow.math.sum": { in0: "inherit", in1: "inherit", out: "from(in0)" },
  "signal-flow.math.product": { in0: "inherit", in1: "inherit", out: "from(in0)" },
  "signal-flow.math.divide": { in0: "inherit", in1: "inherit", out: "from(in0)" },
  "signal-flow.math.abs": { in: "inherit", out: "from(in)" },
  "signal-flow.math.sqrt": { in: "inherit", out: "from(in)" },
  "signal-flow.math.sign": { in: "inherit", out: "from(in)" },
  "signal-flow.sink.scope": { in: "inherit" },
  "signal-flow.sink.terminator": { in: "inherit" },
  "signal-flow.continuous.integrator": { in: "inherit", out: "from(in)" },
  "signal-flow.continuous.transfer_function": { in: "inherit", out: "from(in)" },
  "signal-flow.continuous.state_space": { in: "inherit", out: "from(in)" },
  "signal-flow.continuous.pid": { in: "inherit", out: "from(in)" },
  "signal-flow.continuous.derivative": { in: "inherit", out: "from(in)" },
  "signal-flow.discrete.integrator": { in: "inherit", out: "from(in)" },
  "signal-flow.discrete.unit_delay": { in: "inherit", out: "from(in)" },
  "signal-flow.discrete.zero_order_hold": { in: "inherit", out: "from(in)" },
  "signal-flow.discrete.delay": { in: "inherit", out: "from(in)" },
  "signal-flow.source.sine": { out: "[1]" },
  "signal-flow.source.step": { out: "[1]" },
  "signal-flow.source.ramp": { out: "[1]" },
  "signal-flow.source.pulse": { out: "[1]" },
  "signal-flow.source.ground": { out: "[1]" },
  "signal-flow.source.from_workspace": { out: "[1]" },
  "routing.mux": { "in*": "inherit", out: "sum(in*)" },
  "signal-flow.routing.mux": { "in*": "inherit", out: "sum(in*)" },
  "routing.demux": { in: "inherit", "out*": "partition(in, outputs)" },
  "signal-flow.routing.demux": { in: "inherit", "out*": "partition(in, outputs)" },
  "signal-flow.attributes.signal_specification": { in: "inherit", out: "from(in)" },
  "signal-flow.attributes.ic": { in: "inherit", out: "from(in)" },
  "signal-flow.attributes.unit_conversion": { in: "inherit", out: "from(in)" },
  "signal-flow.attributes.probe": {
    in: "inherit",
    width_out: "[1]",
    dim_out: "[1]",
    complexity_out: "[1]",
  },
};

// ---------------------------------------------------------------------------
// Port id pattern matching (for variadic 'in*', 'out*' patterns)
// ---------------------------------------------------------------------------

function matchPortSig(portId: string, sigs: PortSigMap): string | null {
  // Exact match first
  if (portId in sigs) return sigs[portId] ?? null;
  // Wildcard prefix match: 'in*' matches 'in0', 'in1', 'in_0', etc.
  for (const pattern of Object.keys(sigs)) {
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      if (portId.startsWith(prefix)) return sigs[pattern] ?? null;
    }
  }
  return null;
}

/** Get all port ids from a block's sigs that match a wildcard pattern */
function matchingPortIds(pattern: string, _sigs: PortSigMap, actualPortIds: string[]): string[] {
  if (!pattern.endsWith("*")) return actualPortIds.filter((id) => id === pattern);
  const prefix = pattern.slice(0, -1);
  return actualPortIds.filter((id) => id.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Dim equality
// ---------------------------------------------------------------------------

function dimsEqual(a: Dim, b: Dim): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main propagate function
// ---------------------------------------------------------------------------

/**
 * Propagate signal dimensions through a model.
 *
 * Returns a Map<wireId, dim[]> for all signal-flow wires whose dim could
 * be resolved, or a PropagateError if there is a mismatch, unresolvable
 * wire, or algebraic loop.
 */
export function propagate(model: PropagateModel): PropagateResult {
  const blockMap = new Map(model.blocks.map((b) => [b.id, b]));

  // Build adjacency: which wires connect to which ports
  // sourcePort(blockId, portId) -> wireId (from side)
  const srcPortToWire = new Map<string, string>(); // `${blockId}:${portId}` -> wireId
  // sinkPort(blockId, portId) -> wireId (to side)
  const sinkPortToWire = new Map<string, string>(); // `${blockId}:${portId}` -> wireId

  // Track which ports exist per block (for variadic resolution)
  const blockInputPorts = new Map<string, string[]>(); // blockId -> input portIds
  const blockOutputPorts = new Map<string, string[]>(); // blockId -> output portIds

  for (const wire of model.wires) {
    const srcKey = `${wire.from.block}:${wire.from.port}`;
    const sinkKey = `${wire.to.block}:${wire.to.port}`;
    srcPortToWire.set(srcKey, wire.id);
    sinkPortToWire.set(sinkKey, wire.id);

    // Track ports per block
    if (!blockOutputPorts.has(wire.from.block)) blockOutputPorts.set(wire.from.block, []);
    if (!blockInputPorts.has(wire.to.block)) blockInputPorts.set(wire.to.block, []);
    // biome-ignore lint/style/noNonNullAssertion: initialized above
    blockOutputPorts.get(wire.from.block)!.push(wire.from.port);
    // biome-ignore lint/style/noNonNullAssertion: initialized above
    blockInputPorts.get(wire.to.block)!.push(wire.to.port);
  }

  // resolved dims: wireId -> Dim
  const wireDims = new Map<string, Dim>();
  // resolved port dims: `${blockId}:${portId}` -> Dim
  const portDims = new Map<string, Dim>();

  // -- Pass 1: resolve constant sources (shape(param)) and literal dims --
  for (const block of model.blocks) {
    if (isAcausalBlock(block)) continue;
    const sigs = resolvePortSigs(block.type);
    if (!sigs) continue;

    const outPorts = blockOutputPorts.get(block.id) ?? [];
    for (const portId of outPorts) {
      const sig = matchPortSig(portId, sigs);
      if (!sig) continue;

      // Literal dim: e.g. "[1]" or "[3]"
      const literalMatch = sig.match(/^\[(\d+(?:,\s*\d+)*)\]$/);
      if (literalMatch) {
        const literal = literalMatch[1];
        if (literal) {
          const dim = literal.split(",").map((s) => Number.parseInt(s.trim(), 10));
          const portKey = `${block.id}:${portId}`;
          portDims.set(portKey, dim);
          const wireId = srcPortToWire.get(portKey);
          if (wireId) wireDims.set(wireId, dim);
        }
      }

      // shape(param)
      const shapeMatch = sig.match(/^shape\((\w+)\)$/);
      if (shapeMatch) {
        const paramName = shapeMatch[1];
        if (paramName) {
          const paramValue = block.params?.[paramName];
          const dim = shapeOf(paramValue);
          const portKey = `${block.id}:${portId}`;
          portDims.set(portKey, dim);
          const wireId = srcPortToWire.get(portKey);
          if (wireId) wireDims.set(wireId, dim);
        }
      }
    }
  }

  // -- Iterative propagation --
  const MAX_ITER = model.blocks.length * 4 + 10;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    let changed = false;

    for (const block of model.blocks) {
      if (isAcausalBlock(block)) continue;
      const sigs = resolvePortSigs(block.type);
      if (!sigs) continue;

      // Step A: resolve input port dims from connected wires
      const inPorts = blockInputPorts.get(block.id) ?? [];
      for (const portId of inPorts) {
        const portKey = `${block.id}:${portId}`;
        if (portDims.has(portKey)) continue; // already resolved
        const wireId = sinkPortToWire.get(portKey);
        if (!wireId) continue;
        const dim = wireDims.get(wireId);
        if (!dim) continue;

        const sig = matchPortSig(portId, sigs);
        if (!sig) continue;

        if (sig === "inherit") {
          portDims.set(portKey, dim);
          changed = true;
        }
      }

      // Step B: resolve output port dims from port_sigs
      const outPorts = blockOutputPorts.get(block.id) ?? [];
      for (const portId of outPorts) {
        const portKey = `${block.id}:${portId}`;
        if (portDims.has(portKey)) continue; // already resolved

        const sig = matchPortSig(portId, sigs);
        if (!sig) continue;

        // from(portId) - output inherits from a named input port
        const fromMatch = sig.match(/^from\((\w+)\)$/);
        if (fromMatch) {
          const srcPortId = fromMatch[1];
          if (!srcPortId) continue;
          // Check if this is a signal_specification block with hard constraint
          const specDim = getSignalSpecDim(block, srcPortId, sigs);
          if (specDim) {
            portDims.set(portKey, specDim);
            const wireId = srcPortToWire.get(portKey);
            if (wireId) wireDims.set(wireId, specDim);
            changed = true;
            continue;
          }
          const srcPortKey = `${block.id}:${srcPortId}`;
          const srcDim = portDims.get(srcPortKey);
          if (srcDim) {
            portDims.set(portKey, srcDim);
            const wireId = srcPortToWire.get(portKey);
            if (wireId) wireDims.set(wireId, srcDim);
            changed = true;
          }
          continue;
        }

        // sum(in*) - output dim = sum of all matching input port dims
        const sumMatch = sig.match(/^sum\((\w+\*?)\)$/);
        if (sumMatch) {
          const pattern = sumMatch[1];
          if (!pattern) continue;
          const allInPorts = blockInputPorts.get(block.id) ?? [];
          const matchedPorts = matchingPortIds(pattern, sigs, allInPorts);
          if (matchedPorts.length === 0) {
            // No inputs connected yet
            portDims.set(portKey, [0]);
            const wireId = srcPortToWire.get(portKey);
            if (wireId) wireDims.set(wireId, [0]);
            changed = true;
            continue;
          }
          const allResolved = matchedPorts.every((pid) => portDims.has(`${block.id}:${pid}`));
          if (allResolved) {
            let total = 0;
            for (const pid of matchedPorts) {
              const d = portDims.get(`${block.id}:${pid}`);
              if (d) total += d[0] ?? 1;
            }
            const dim: Dim = [total];
            portDims.set(portKey, dim);
            const wireId = srcPortToWire.get(portKey);
            if (wireId) wireDims.set(wireId, dim);
            changed = true;
          }
          continue;
        }

        // partition(in, param) - output dims partition the input dim
        const partitionMatch = sig.match(/^partition\((\w+),\s*(\w+)\)$/);
        if (partitionMatch) {
          const srcPortId = partitionMatch[1];
          const paramName = partitionMatch[2];
          if (!srcPortId || !paramName) continue;
          const srcPortKey = `${block.id}:${srcPortId}`;
          const srcDim = portDims.get(srcPortKey);
          if (srcDim) {
            // Determine which index in partition this port corresponds to
            const outSig = matchPortSig(portId, sigs);
            const patternKey = Object.keys(sigs).find((k) => k.endsWith("*") && outSig === sigs[k]);
            if (patternKey) {
              const prefix = patternKey.slice(0, -1);
              const idx = Number.parseInt(portId.slice(prefix.length), 10);
              const partitionParam = block.params?.[paramName];
              let partitionList: number[] = [];
              if (Array.isArray(partitionParam)) {
                partitionList = partitionParam as number[];
              } else if (typeof partitionParam === "string") {
                try {
                  partitionList = JSON.parse(partitionParam) as number[];
                } catch {
                  partitionList = [];
                }
              }
              if (Number.isFinite(idx) && idx < partitionList.length) {
                const dim: Dim = [partitionList[idx] ?? 1];
                portDims.set(portKey, dim);
                const wireId = srcPortToWire.get(portKey);
                if (wireId) wireDims.set(wireId, dim);
                changed = true;
              }
            }
          }
        }
      }
    }

    if (!changed) break;
  }

  // -- Cycle detection for unresolved inherit-chain ports --
  // Build a dependency graph of output ports → input ports → output ports
  const unresolvedOutPorts: string[] = [];
  for (const block of model.blocks) {
    if (isAcausalBlock(block)) continue;
    const sigs = resolvePortSigs(block.type);
    if (!sigs) continue;
    const outPorts = blockOutputPorts.get(block.id) ?? [];
    for (const portId of outPorts) {
      const portKey = `${block.id}:${portId}`;
      if (!portDims.has(portKey)) {
        const sig = matchPortSig(portId, sigs);
        if (
          sig &&
          (sig === "inherit" ||
            sig.startsWith("from(") ||
            sig.startsWith("sum(") ||
            sig.startsWith("partition("))
        ) {
          unresolvedOutPorts.push(portKey);
        }
      }
    }
  }

  if (unresolvedOutPorts.length > 0) {
    // Try to detect a cycle by following dependencies
    const cycle = detectCycle(
      model,
      blockMap,
      srcPortToWire,
      sinkPortToWire,
      blockInputPorts,
      blockOutputPorts,
    );
    if (cycle) {
      return { error: "dim-loop", cycle };
    }

    // Unresolved but no cycle - return dim-unresolved
    const unresolvedWires: string[] = [];
    for (const block of model.blocks) {
      for (const wire of model.wires) {
        if (wire.from.block === block.id || wire.to.block === block.id) {
          if (!wireDims.has(wire.id)) {
            unresolvedWires.push(wire.id);
          }
        }
      }
    }
    if (unresolvedWires.length > 0) {
      return { error: "dim-unresolved", wireIds: [...new Set(unresolvedWires)] };
    }
  }

  // -- Validate mismatch: check each wire where both endpoints are known --
  for (const wire of model.wires) {
    if (isAcausalWire(wire, blockMap)) continue;
    const srcKey = `${wire.from.block}:${wire.from.port}`;
    const sinkKey = `${wire.to.block}:${wire.to.port}`;
    const srcDim = portDims.get(srcKey);
    const sinkDim = portDims.get(sinkKey);
    if (srcDim && sinkDim && !dimsEqual(srcDim, sinkDim)) {
      return { error: "dim-mismatch", wireId: wire.id, expected: srcDim, actual: sinkDim };
    }
  }

  return wireDims;
}

// ---------------------------------------------------------------------------
// signal_specification hard constraint
// ---------------------------------------------------------------------------

function getSignalSpecDim(block: ModelBlock, _fromPortId: string, _sigs: PortSigMap): Dim | null {
  if (
    block.type === "signal-flow.attributes.signal_specification" ||
    block.type === "signal_flow.attributes.signal_specification"
  ) {
    const dim = block.params?.dim;
    if (Array.isArray(dim)) return dim as Dim;
    if (typeof dim === "number") return [dim];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Acausal block detection
// ---------------------------------------------------------------------------

function isAcausalBlock(block: ModelBlock): boolean {
  if (block.paradigm && block.paradigm !== "signal-flow") return true;
  // Heuristic: type contains physical-*
  if (block.type.startsWith("physical-") || block.type.startsWith("physical_")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

/**
 * Detect a dim-inference cycle by building a dependency graph of wire-dims
 * and checking for cycles using DFS.
 *
 * Each wire's dim depends on the source block's output port dim.
 * Each block's output port dim (via from/sum/partition) depends on its
 * input port dims, which depend on incoming wire dims.
 *
 * We use "port nodes" keyed by `${blockId}:${portId}`.
 */
function detectCycle(
  model: PropagateModel,
  _blockMap: Map<string, ModelBlock>,
  _srcPortToWire: Map<string, string>,
  sinkPortToWire: Map<string, string>,
  blockInputPorts: Map<string, string[]>,
  blockOutputPorts: Map<string, string[]>,
): string[] | null {
  // Build edges: portKey -> portKey[]
  const edges = new Map<string, string[]>();

  for (const block of model.blocks) {
    if (isAcausalBlock(block)) continue;
    const sigs = resolvePortSigs(block.type);
    if (!sigs) continue;

    // For each output port, find its dependencies
    for (const portId of blockOutputPorts.get(block.id) ?? []) {
      const portKey = `${block.id}:${portId}`;
      const sig = matchPortSig(portId, sigs);
      if (!sig) continue;

      const deps: string[] = [];

      const fromMatch = sig.match(/^from\((\w+)\)$/);
      if (fromMatch) {
        const srcPortId = fromMatch[1];
        if (!srcPortId) continue;
        // This output depends on the input port srcPortId
        // which depends on the wire connected to it
        const srcPortKey = `${block.id}:${srcPortId}`;
        deps.push(srcPortKey);
      }

      const sumMatch = sig.match(/^sum\((\w+\*?)\)$/);
      if (sumMatch) {
        const pattern = sumMatch[1];
        if (!pattern) continue;
        const inPorts = blockInputPorts.get(block.id) ?? [];
        const matched = matchingPortIds(pattern, sigs, inPorts);
        for (const pid of matched) {
          deps.push(`${block.id}:${pid}`);
        }
      }

      const partitionMatch = sig.match(/^partition\((\w+),/);
      if (partitionMatch) {
        const srcPortId = partitionMatch[1];
        if (!srcPortId) continue;
        deps.push(`${block.id}:${srcPortId}`);
      }

      if (deps.length > 0) {
        edges.set(portKey, deps);
      }
    }

    // For each input port, it depends on the wire connected to it (from wire's source port)
    for (const portId of blockInputPorts.get(block.id) ?? []) {
      const portKey = `${block.id}:${portId}`;
      const wireId = sinkPortToWire.get(portKey);
      if (!wireId) continue;
      const wire = model.wires.find((w) => w.id === wireId);
      if (!wire) continue;
      const srcPortKey = `${wire.from.block}:${wire.from.port}`;
      edges.set(portKey, [srcPortKey]);
    }
  }

  // DFS cycle detection
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string>();

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    for (const neighbor of edges.get(node) ?? []) {
      const c = color.get(neighbor) ?? WHITE;
      if (c === GRAY) {
        // Found cycle — reconstruct it
        const cycle: string[] = [neighbor];
        let cur = node;
        while (cur !== neighbor) {
          cycle.unshift(cur);
          const p = parent.get(cur);
          if (!p || cycle.length > 100) break;
          cur = p;
        }
        return cycle;
      }
      if (c === WHITE) {
        parent.set(neighbor, node);
        const result = dfs(neighbor);
        if (result) return result;
      }
    }
    color.set(node, BLACK);
    return null;
  }

  for (const node of edges.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const result = dfs(node);
      if (result) return result;
    }
  }
  return null;
}
