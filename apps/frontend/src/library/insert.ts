import type { Block, BlockMetadata, Fidelity, ParamValue } from "../model/types";

import { useGraphStore, useLibraryStore, useUiStore } from "../store";
import { blockDomainOf } from "./block-domain";
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

/**
 * The tier a freshly placed block starts on: the component's own.
 *
 * This used to be `paradigm === "physical-network" ? "ideal" : "n_a"`, which named a tier
 * without asking whether the component had it. `n_a` means "not applicable" and is what a
 * component with no real fidelity levels declares, so every signal-flow block was placed on a
 * tier that, for anything with real tiers, either did not exist or was migration residue
 * carrying a parameter vocabulary the engine never read. A PID or a sine source dropped from
 * the palette came out unable to compile.
 *
 * `ideal` first when the component has it, because it is the simplest model and the one a user
 * means by placing a part without choosing; otherwise the first tier declared. `n_a` is the
 * answer only when the component itself says so.
 */
function initialFidelity(metadata: BlockMetadata): Fidelity {
  // The schema types `fidelities` as a required non-empty tuple, but a hand-built metadata
  // object reaches here without one -- so this reads it defensively rather than trusting the
  // type. `n_a` is then the honest answer: it is the one case where "not applicable" is
  // literally true.
  const tiers = metadata.fidelities?.map((entry) => entry.tier) ?? [];
  if (tiers.includes("ideal")) return "ideal";
  return tiers[0] ?? "n_a";
}

export function createBlockFromMetadata(
  metadata: BlockMetadata,
  position = nextInsertPosition(),
): Block {
  const fidelity = initialFidelity(metadata);
  // The parameters of the tier the block is actually on, not the component's whole list.
  // `fidelity-swap` already treats a tier's list as definitive -- it adds what the target tier
  // declares and removes what it omits -- so sourcing them anywhere else means a block's
  // parameters change the first time its fidelity is touched, even when it is set to the tier
  // it already had. Falls back to the component list for a component that declares no tier
  // parameters at all.
  const tierParams = metadata.fidelities?.find((entry) => entry.tier === fidelity)?.params;
  const params =
    tierParams && tierParams.length > 0
      ? Object.fromEntries(
          tierParams.map((param) => [
            param.id,
            structuredClone((param.default ?? "") as ParamValue),
          ]),
        )
      : Object.fromEntries(
          metadata.params.map((param) => [
            param.name,
            structuredClone((param.default ?? "") as ParamValue),
          ]),
        );
  return {
    id: `${sanitizeId(metadata.name)}-${crypto.randomUUID()}`,
    type: metadata.name,
    paradigm: inferParadigm(metadata.name),
    domain: blockDomainOf(metadata),
    fidelity,
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
