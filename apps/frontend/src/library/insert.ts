import type { Block, BlockMetadata, ParamValue } from "../model/types";

import { useGraphStore, useLibraryStore, useUiStore } from "../store";
import { assignRefdes } from "./refdes";

export { assignRefdes } from "./refdes";

function sanitizeId(value: string): string {
  return value
    .replace(/[^a-z0-9_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function nextInsertPosition(): [number, number] {
  const { document } = useGraphStore.getState();
  const { pan, zoom } = useUiStore.getState();
  const grid = document.model.grid;
  const count = document.model.blocks.length;
  const column = count % 4;
  const row = Math.floor(count / 4);
  const x = Math.round((-pan.x / Math.max(zoom, 0.001) + 80 + column * 160) / grid) * grid;
  const y = Math.round((-pan.y / Math.max(zoom, 0.001) + 80 + row * 100) / grid) * grid;
  return [x, y];
}

function inferParadigm(type: string): Block["paradigm"] {
  if (type.startsWith("signal-flow.")) return "signal-flow";
  if (type.startsWith("physical-")) return "physical-network";
  if (type.startsWith("converter.")) return "converter";
  if (type.startsWith("hierarchy.")) return "hierarchy";
  if (type.startsWith("routing.")) return "routing";
  if (type.startsWith("annotation.")) return "annotation";
  return "signal-flow";
}

const SHORT_DOMAIN_MAP: Record<string, Block["domain"]> = {
  electrical: "physical-electrical",
  thermal: "physical-thermal",
  mechanical: "physical-translational",
};

function normalizeDomain(raw: string): Block["domain"] {
  return (SHORT_DOMAIN_MAP[raw] as Block["domain"]) ?? (raw as Block["domain"]);
}

function inferDomain(metadata: BlockMetadata): Block["domain"] {
  const firstPort = metadata.ports.outputs[0] ?? metadata.ports.inputs[0];
  if (firstPort?.kind.domain) return normalizeDomain(firstPort.kind.domain);
  if (metadata.behavior.domain) return normalizeDomain(metadata.behavior.domain);
  return "signal";
}

export function createBlockFromMetadata(
  metadata: BlockMetadata,
  position = nextInsertPosition(),
): Block {
  const params = Object.fromEntries(
    metadata.params.map((param) => [
      param.name,
      structuredClone((param.default ?? "") as ParamValue),
    ]),
  );
  return {
    id: `${sanitizeId(metadata.name)}-${crypto.randomUUID()}`,
    type: metadata.name,
    paradigm: inferParadigm(metadata.name),
    domain: inferDomain(metadata),
    fidelity: inferParadigm(metadata.name) === "physical-network" ? "ideal" : "n_a",
    position,
    rotation: 0,
    mirror: "none",
    params,
    ic: {},
    label: assignRefdes(metadata.name, useGraphStore.getState().document.model.blocks),
  };
}

/**
 * When the library runs in its own VS Code sidebar webview it has no graph of
 * its own — the document lives in the schematic custom editor's webview. The
 * extension host relays the request to whichever schematic editor is active.
 * Installed by `vscode/library-main.tsx`; null everywhere else.
 */
let remoteInsert: ((metadata: BlockMetadata) => void) | null = null;

export function setRemoteInsertHandler(handler: ((metadata: BlockMetadata) => void) | null): void {
  remoteInsert = handler;
}

export function insertCatalogBlock(metadata: BlockMetadata): void {
  if (remoteInsert) {
    remoteInsert(metadata);
    useLibraryStore.getState().markRecentlyUsed(metadata.name);
    return;
  }
  const graph = useGraphStore.getState();
  graph.transact(`insert ${metadata.name}`, () => {
    graph.addBlock(createBlockFromMetadata(metadata));
  });
  useLibraryStore.getState().markRecentlyUsed(metadata.name);
}

export function insertAtPosition(metadata: BlockMetadata, position: [number, number]): void {
  const graph = useGraphStore.getState();
  graph.transact(`insert ${metadata.name}`, () => {
    graph.addBlock(createBlockFromMetadata(metadata, position));
  });
}
