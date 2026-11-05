/**
 * FE-105: Voltage / current probe model, persisted in the .gsim_sch document.
 *
 * Pure, DOM-free. Probes are measurement labels: a V probe reads a node voltage
 * `V(node)` (or a differential `V(node1,node2)`), an I probe reads a component
 * current `I(refdes)`. Ported from the reference editor `schematic_editor.html`,
 * but persisted under `model.metadata.probes` (the schema-sanctioned free-form
 * object, additionalProperties:true) rather than a bespoke top-level array.
 */

import type { Model, ParamValue } from "../model/types";

export interface Probe {
  id: string;
  kind: "V" | "I";
  label: string;
  position: [number, number];
  /** Node name(s) for a V probe: one for V(node), two for V(node1,node2). */
  nodes?: string[];
  /** Component refdes for an I probe. */
  block?: string;
}

export function vProbeLabel(node: string): string {
  return `V(${node})`;
}

export function vProbePairLabel(nodeA: string, nodeB: string): string {
  return `V(${nodeA},${nodeB})`;
}

export function iProbeLabel(refdes: string): string {
  return `I(${refdes})`;
}

export function createVProbe(id: string, node: string, position: [number, number]): Probe {
  return { id, kind: "V", label: vProbeLabel(node), position, nodes: [node] };
}

export function createVProbePair(
  id: string,
  nodeA: string,
  nodeB: string,
  position: [number, number],
): Probe {
  return { id, kind: "V", label: vProbePairLabel(nodeA, nodeB), position, nodes: [nodeA, nodeB] };
}

export function createIProbe(id: string, refdes: string, position: [number, number]): Probe {
  return { id, kind: "I", label: iProbeLabel(refdes), position, block: refdes };
}

// ---------------------------------------------------------------------------
// Two-step V-probe gesture: first wire double-click, then a second wire.
// ---------------------------------------------------------------------------

export interface PendingVProbe {
  firstNode: string;
}

export function beginVProbe(node: string): PendingVProbe {
  return { firstNode: node };
}

/**
 * Complete a pending V probe with the second wire's node, producing a
 * differential V(node1,node2) probe.
 */
export function completeVProbe(
  pending: PendingVProbe,
  secondNode: string,
  id: string,
  position: [number, number],
): Probe {
  return createVProbePair(id, pending.firstNode, secondNode, position);
}

// ---------------------------------------------------------------------------
// Serialization into model.metadata.probes
// ---------------------------------------------------------------------------

function probeToRecord(probe: Probe): Record<string, ParamValue> {
  const record: Record<string, ParamValue> = {
    id: probe.id,
    kind: probe.kind,
    label: probe.label,
    position: [probe.position[0], probe.position[1]],
  };
  if (probe.nodes) {
    record.nodes = [...probe.nodes];
  }
  if (probe.block !== undefined) {
    record.block = probe.block;
  }
  return record;
}

function parseProbe(value: ParamValue): Probe | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, ParamValue>;
  const id = record.id;
  const kind = record.kind;
  const label = record.label;
  const position = record.position;
  if (typeof id !== "string" || (kind !== "V" && kind !== "I") || typeof label !== "string") {
    return null;
  }
  if (
    !Array.isArray(position) ||
    typeof position[0] !== "number" ||
    typeof position[1] !== "number"
  ) {
    return null;
  }
  const probe: Probe = { id, kind, label, position: [position[0], position[1]] };
  if (Array.isArray(record.nodes)) {
    probe.nodes = record.nodes.filter((n): n is string => typeof n === "string");
  }
  if (typeof record.block === "string") {
    probe.block = record.block;
  }
  return probe;
}

export function readProbes(model: Model): Probe[] {
  const raw = model.metadata?.probes;
  if (!Array.isArray(raw)) {
    return [];
  }
  const probes: Probe[] = [];
  for (const entry of raw) {
    const probe = parseProbe(entry);
    if (probe) {
      probes.push(probe);
    }
  }
  return probes;
}

/** Write the probe list into `model.metadata.probes` (mutates the model). */
export function writeProbes(model: Model, probes: Probe[]): void {
  const metadata = model.metadata ?? {};
  metadata.probes = probes.map(probeToRecord);
  model.metadata = metadata;
}

export function addProbe(model: Model, probe: Probe): void {
  writeProbes(model, [...readProbes(model), probe]);
}

export function removeProbe(model: Model, probeId: string): void {
  writeProbes(
    model,
    readProbes(model).filter((p) => p.id !== probeId),
  );
}
