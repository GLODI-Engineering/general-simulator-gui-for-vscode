import type { ParamValue } from "../model/types";

import {
  type FidelityEntry,
  type FidelityPortDef,
  type Tier,
  getCatalogEntryResult,
} from "./catalog-core";

export type SwapReason = "port-shape-mismatch" | "unknown-fidelity";

export interface ParamDelta {
  added: Record<string, ParamValue>;
  removed: string[];
}

export type CanSwapResult =
  | { ok: true; paramDelta: ParamDelta }
  | {
      ok: false;
      reason: SwapReason;
      port?: string;
      wasKind?: string;
      wouldKind?: string;
    };

export type SwapResult =
  | { ok: true; paramDelta: ParamDelta; removedWires: string[] }
  | {
      ok: false;
      reason: SwapReason;
      port?: string;
      wasKind?: string;
      wouldKind?: string;
    };

type ModelLike = {
  blocks: Array<{ id: string; type: string; fidelity: string; params: Record<string, ParamValue> }>;
  wires?: Array<{
    id: string;
    from: { block: string; port: string };
    to: { block: string; port: string };
  }>;
};

function requireBlock(model: ModelLike, blockId: string) {
  const block = model.blocks.find((candidate) => candidate.id === blockId);
  if (!block) {
    throw new Error(`fidelity-swap: block not found: ${blockId}`);
  }
  return block;
}

function portMap(ports: FidelityPortDef[]): Map<string, FidelityPortDef> {
  return new Map(ports.map((port) => [port.id, port] as const));
}

function comparePortShape(
  current: FidelityEntry,
  target: FidelityEntry,
):
  | {
      ok: true;
    }
  | {
      ok: false;
      port: string;
      wasKind?: string;
      wouldKind?: string;
    } {
  const currentPorts = portMap(current.ports);
  const targetPorts = portMap(target.ports);

  // Different counts means extra/missing port; report the first differing id.
  if (currentPorts.size !== targetPorts.size) {
    for (const id of targetPorts.keys()) {
      if (!currentPorts.has(id)) {
        return {
          ok: false,
          port: id,
          wasKind: undefined,
          wouldKind: targetPorts.get(id)?.kind,
        };
      }
    }
    for (const id of currentPorts.keys()) {
      if (!targetPorts.has(id)) {
        return {
          ok: false,
          port: id,
          wasKind: currentPorts.get(id)?.kind,
          wouldKind: undefined,
        };
      }
    }
  }

  // Same count: ids match; validate kinds.
  for (const [id, currentPort] of currentPorts.entries()) {
    const targetPort = targetPorts.get(id);
    if (!targetPort) {
      return { ok: false, port: id, wasKind: currentPort.kind, wouldKind: undefined };
    }
    if (currentPort.kind !== targetPort.kind) {
      return { ok: false, port: id, wasKind: currentPort.kind, wouldKind: targetPort.kind };
    }
  }

  return { ok: true };
}

function paramDeltaFor(current: FidelityEntry, target: FidelityEntry): ParamDelta {
  const currentIds = new Set(current.params.map((param) => param.id));
  const targetIds = new Set(target.params.map((param) => param.id));

  const added: Record<string, ParamValue> = {};
  for (const param of target.params) {
    if (!currentIds.has(param.id)) {
      added[param.id] = structuredClone((param.default ?? "") as ParamValue);
    }
  }

  const removed: string[] = [];
  for (const param of current.params) {
    if (!targetIds.has(param.id)) {
      removed.push(param.id);
    }
  }

  return { added, removed };
}

function getEntryOrUnknown(type: string, fidelity: Tier | string) {
  const result = getCatalogEntryResult(type, fidelity);
  if ("entry" in result) {
    if (result.entry) {
      return { ok: true as const, entry: result.entry };
    }
    if (result.error === "unknown-fidelity") {
      return { ok: false as const, reason: "unknown-fidelity" as const };
    }
    throw new Error(`fidelity-swap: unknown block type: ${type}`);
  }
  return { ok: true as const, entry: result };
}

export function canSwap(blockId: string, newFidelity: string, model: ModelLike): CanSwapResult {
  const block = requireBlock(model, blockId);

  const currentEntryResult = getEntryOrUnknown(block.type, block.fidelity);
  if (!currentEntryResult.ok) {
    return { ok: false, reason: currentEntryResult.reason };
  }

  const targetEntryResult = getEntryOrUnknown(block.type, newFidelity);
  if (!targetEntryResult.ok) {
    return { ok: false, reason: targetEntryResult.reason };
  }

  const portsOk = comparePortShape(currentEntryResult.entry, targetEntryResult.entry);
  if (!portsOk.ok) {
    return {
      ok: false,
      reason: "port-shape-mismatch",
      port: portsOk.port,
      wasKind: portsOk.wasKind,
      wouldKind: portsOk.wouldKind,
    };
  }

  return {
    ok: true,
    paramDelta: paramDeltaFor(currentEntryResult.entry, targetEntryResult.entry),
  };
}

export function swap(blockId: string, newFidelity: string, model: ModelLike): SwapResult {
  const block = requireBlock(model, blockId);

  const preflight = canSwap(blockId, newFidelity, model);
  if (!preflight.ok) {
    return preflight;
  }

  const currentEntryResult = getEntryOrUnknown(block.type, block.fidelity);
  const targetEntryResult = getEntryOrUnknown(block.type, newFidelity);
  if (!currentEntryResult.ok || !targetEntryResult.ok) {
    return { ok: false, reason: "unknown-fidelity" };
  }

  const targetEntry = targetEntryResult.entry;

  const nextParams: Record<string, ParamValue> = {};
  for (const param of targetEntry.params) {
    const existing = block.params[param.id];
    if (existing !== undefined) {
      nextParams[param.id] = structuredClone(existing);
    } else {
      nextParams[param.id] = structuredClone((param.default ?? "") as ParamValue);
    }
  }

  const allowedPorts = new Set(targetEntry.ports.map((port) => port.id));
  const removedWires: string[] = [];
  if (model.wires) {
    model.wires = model.wires.filter((wire) => {
      const fromDropped = wire.from.block === blockId && !allowedPorts.has(wire.from.port);
      const toDropped = wire.to.block === blockId && !allowedPorts.has(wire.to.port);
      if (fromDropped || toDropped) {
        removedWires.push(wire.id);
        return false;
      }
      return true;
    });
  }

  block.fidelity = newFidelity as Tier;
  block.params = nextParams;

  return {
    ok: true,
    paramDelta: preflight.paramDelta,
    removedWires,
  };
}

export default canSwap;
