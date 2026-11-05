/**
 * Model-level utilities for param resolution and subsystem hierarchy management.
 *
 * These helpers are kept separate from the Zustand graph store so they can be
 * imported without pulling in store boilerplate.
 */

import type {
  Block,
  Model,
  ModelDocument,
  PortKindDomain,
  SubsystemPort,
  Wire,
} from "../model/types";
import type { Analysis, ParamEntry } from "../model/types";
// The parser in param_expression implements exactly the grammar the format
// spec defines for these strings (§5.2), and evaluates it without generating
// code — which the VS Code webview's CSP requires.
import { tryEvalExpr as evalExpr } from "../persistence/param_expression";

/**
 * Resolve all model-level params into a flat `name → number` map.
 *
 * Params are resolved in order; a param whose value is an identifier can only
 * reference params that appear before it (or have already been resolved).
 * Expression params are evaluated after all direct values are known.
 */
export function resolveModelParams(params: ParamEntry[]): Record<string, number> {
  const resolved: Record<string, number> = {};

  // First pass: plain numbers
  for (const p of params) {
    if (typeof p.value === "number") {
      resolved[p.name] = p.value;
    }
  }

  // Second pass: identifiers and expressions (iterate until stable)
  let changed = true;
  let iterations = 0;
  while (changed && iterations < params.length + 1) {
    changed = false;
    iterations++;
    for (const p of params) {
      if (p.name in resolved) continue;
      if (typeof p.value === "string") {
        // identifier?
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.value)) {
          if (p.value in resolved) {
            resolved[p.name] = resolved[p.value] as number;
            changed = true;
          }
        } else if (/^\{.*\}$/.test(p.value)) {
          // expression
          const result = evalExpr(p.value.slice(1, -1), resolved);
          if (result !== null) {
            resolved[p.name] = result;
            changed = true;
          }
        }
      }
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Subsystem hierarchy utilities (spec §11)
// ---------------------------------------------------------------------------

/**
 * Derive the list of SubsystemPort[] for a subsystem block from the
 * hierarchy.inport / hierarchy.outport blocks inside its body.
 *
 * This keeps subsystem.ports[] in sync when the user adds/removes/renames
 * boundary blocks inside the body.
 */
export function deriveBoundaryPorts(innerBlocks: Block[]): SubsystemPort[] {
  const ports: SubsystemPort[] = [];
  for (const block of innerBlocks) {
    if (block.type === "hierarchy.inport") {
      const id = typeof block.params.id === "string" ? block.params.id : block.id;
      const kind = (
        typeof block.params.kind === "string" ? block.params.kind : "signal"
      ) as PortKindDomain;
      ports.push({ id, direction: "in", kind, boundary_block: block.id });
    } else if (block.type === "hierarchy.outport") {
      const id = typeof block.params.id === "string" ? block.params.id : block.id;
      const kind = (
        typeof block.params.kind === "string" ? block.params.kind : "signal"
      ) as PortKindDomain;
      ports.push({ id, direction: "out", kind, boundary_block: block.id });
    }
  }
  return ports;
}

/**
 * Navigate to the Model at `pathStack` depth starting from `rootModel`.
 * An empty pathStack returns the root model.
 * Returns null if any id in the path does not resolve to a subsystem block.
 */
export function resolveModelAtPath(rootModel: Model, pathStack: string[]): Model | null {
  let current: Model = rootModel;
  for (const id of pathStack) {
    const block = current.blocks.find((b) => b.id === id);
    if (!block || !block.subsystem) return null;
    current = block.subsystem;
  }
  return current;
}

/**
 * Collect all block ids in `model` recursively (including nested subsystems).
 * Used for id-uniqueness checks per spec §17.1.3.
 */
export function collectAllBlockIds(model: Model): Set<string> {
  const ids = new Set<string>();
  function walk(m: Model) {
    for (const block of m.blocks) {
      ids.add(block.id);
      if (block.subsystem) walk(block.subsystem);
    }
  }
  walk(model);
  return ids;
}

/**
 * Ensure all block ids in `model` are unique across the entire hierarchy.
 * Clones with renamed ids (appends a numeric suffix) when duplicates are found.
 * Returns a new Model with any duplicates renamed.
 */
export function ensureUniqueBlockIds(model: Model): Model {
  const seen = new Set<string>();

  function fixModel(m: Model): Model {
    const renamedBlocks: Block[] = [];
    const idMap = new Map<string, string>(); // old → new

    for (const block of m.blocks) {
      let id = block.id;
      if (seen.has(id)) {
        let suffix = 2;
        while (seen.has(`${id}_${suffix}`)) suffix++;
        id = `${id}_${suffix}`;
      }
      seen.add(id);
      idMap.set(block.id, id);

      const fixedBlock: Block = { ...block, id };
      if (block.subsystem) {
        fixedBlock.subsystem = fixModel(block.subsystem);
      }
      renamedBlocks.push(fixedBlock);
    }

    // Rewrite wires that reference renamed blocks
    const renamedWires: Wire[] = m.wires.map((wire) => ({
      ...wire,
      from: { ...wire.from, block: idMap.get(wire.from.block) ?? wire.from.block },
      to: { ...wire.to, block: idMap.get(wire.to.block) ?? wire.to.block },
    }));

    return { ...m, blocks: renamedBlocks, wires: renamedWires };
  }

  return fixModel(model);
}

/**
 * Sync the `subsystem.ports[]` on `block` to match the hierarchy.inport /
 * hierarchy.outport blocks inside its body.
 *
 * Also updates any wires connected to ports that were renamed:
 * - If a port id changes, wires in the parent that connect to that port are updated.
 *
 * Returns a new ModelDocument with the subsystem block updated.
 */
export function syncSubsystemPorts(
  document: ModelDocument,
  pathStack: string[],
  subsystemBlockId: string,
): ModelDocument {
  const doc = structuredClone(document);

  // Navigate to the parent model (one level above the subsystem block)
  const parentModel = resolveModelAtPath(doc.model, pathStack);
  if (!parentModel) return document;

  const blockIndex = parentModel.blocks.findIndex((b) => b.id === subsystemBlockId);
  if (blockIndex === -1) return document;

  const block = parentModel.blocks[blockIndex];
  if (!block) return document;
  if (!block.subsystem) return document;

  const oldPorts: SubsystemPort[] = block.subsystem.ports ?? [];
  const newPorts = deriveBoundaryPorts(block.subsystem.blocks);

  // Build a rename map: boundary_block → {old id, new id}
  const portById = new Map(oldPorts.map((p) => [p.boundary_block, p.id]));

  // Update wires in parent model that connect to changed port ids
  const updatedWires = parentModel.wires
    .map((wire) => {
      if (wire.from.block === subsystemBlockId) {
        const newPort = newPorts.find((p) => {
          const oldId = portById.get(p.boundary_block);
          return oldId === wire.from.port;
        });
        if (newPort && newPort.id !== wire.from.port) {
          return { ...wire, from: { ...wire.from, port: newPort.id } };
        }
        // If port no longer exists, remove wire
        if (!newPorts.some((p) => p.id === wire.from.port)) {
          return null;
        }
      }
      if (wire.to.block === subsystemBlockId) {
        const newPort = newPorts.find((p) => {
          const oldId = portById.get(p.boundary_block);
          return oldId === wire.to.port;
        });
        if (newPort && newPort.id !== wire.to.port) {
          return { ...wire, to: { ...wire.to, port: newPort.id } };
        }
        // If port no longer exists, remove wire
        if (!newPorts.some((p) => p.id === wire.to.port)) {
          return null;
        }
      }
      return wire;
    })
    .filter((w): w is Wire => w !== null);

  // Apply updated wires + new ports to the cloned document
  parentModel.wires = updatedWires;
  // biome-ignore lint/style/noNonNullAssertion: guarded by blockIndex check above
  parentModel.blocks[blockIndex]!.subsystem!.ports = newPorts;

  return doc;
}

// ---------------------------------------------------------------------------
// Simulation utilities (spec §13)
// ---------------------------------------------------------------------------

/**
 * Convert a v2 Analysis object into the IPC SimulateRequest analysis payload.
 */
export function analysisToPayload(analysis: Analysis): Record<string, unknown> {
  switch (analysis.type) {
    case "TRAN":
      return {
        analysis_type: "TRAN",
        t_end: analysis.t_end,
        t_step: analysis.t_step,
        uic: analysis.uic,
      };
    case "AC":
      return {
        analysis_type: "AC",
        ac_fstart: analysis.f_start,
        ac_fstop: analysis.f_end,
        ac_points: analysis.n_points,
      };
    case "DC":
      return {
        analysis_type: "DC",
        dc_source: analysis.source,
        dc_start: analysis.start,
        dc_stop: analysis.stop,
        dc_step: analysis.step,
      };
    case "OP":
      return { analysis_type: "OP" };
    default:
      return { analysis_type: "OP" };
  }
}
