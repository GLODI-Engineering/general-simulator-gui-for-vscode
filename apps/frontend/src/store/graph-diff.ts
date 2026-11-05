import type { Block, ModelDocument, Wire } from "../model/types";

export interface GraphSnapshot {
  blocks: Record<string, Block>;
  wires: Record<string, Wire>;
  model: ModelDocument["model"];
}

export interface GraphDiffFrame {
  name: string;
  before: GraphSnapshot;
  after: GraphSnapshot;
}

export function cloneGraphSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  return {
    blocks: structuredClone(snapshot.blocks),
    wires: structuredClone(snapshot.wires),
    model: structuredClone(snapshot.model),
  };
}

export function diffHasChanges(before: GraphSnapshot, after: GraphSnapshot): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}
