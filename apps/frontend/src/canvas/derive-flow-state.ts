import type { Edge, Node } from "reactflow";

import type { BlockMetadata } from "../model/types";
import type { Block, Wire } from "../model/types";
import { useLibraryStore } from "../store";
import { activeSubcktDefsFromStore } from "./model-mutation";
import { SYMBOL_SCALE } from "./nodes/port-hit-test";
import { resolveBlockBbox } from "./nodes/resolve-ports";
import { resolveBlockMetadata } from "./subckt-metadata";

export interface FlowBlockData {
  block: Block;
  metadata: BlockMetadata | null;
}

function labelForBlock(block: Block, metadata: BlockMetadata | null): string {
  if (!metadata) {
    return block.type;
  }
  const symbolText = metadata.symbol.text;
  if (!symbolText) {
    return metadata.label;
  }
  return symbolText.replace(/\{([a-z][a-z0-9_]*)\}/gi, (_, name: string) =>
    String(block.params[name] ?? `{${name}}`),
  );
}

export function deriveFlowNodes(blocks: Block[]): Array<Node<FlowBlockData>> {
  const catalog = useLibraryStore.getState().catalog;
  const subcktDefs = activeSubcktDefsFromStore();
  return blocks.map((block) => {
    const metadata = resolveBlockMetadata(block, catalog, subcktDefs);
    const baseBbox: [number, number] =
      block.type === "routing.junction"
        ? [1, 1]
        : (metadata ? resolveBlockBbox(metadata, block.params) : [96, 48]);
    const bbox: [number, number] =
      block.rotation === 90 || block.rotation === 270 ? [baseBbox[1], baseBbox[0]] : baseBbox;
    return {
      id: block.id,
      type: "block",
      position: { x: block.position[0], y: block.position[1] },
      data: { block, metadata },
      draggable: true,
      selectable: true,
      style: {
        width: bbox[0] * SYMBOL_SCALE,
        height: bbox[1] * SYMBOL_SCALE,
        border: "0",
        background: "transparent",
      },
      ariaLabel:
        block.type === "routing.junction"
          ? "wire junction"
          : `${metadata?.label ?? block.type}: ${labelForBlock(block, metadata)}`,
    };
  });
}

export function deriveFlowEdges(wires: Wire[]): Edge[] {
  return wires.map((wire) => ({
    id: wire.id,
    source: wire.from.block,
    target: wire.to.block,
    sourceHandle: wire.from.port,
    targetHandle: wire.to.port,
    type: "wire",
    animated: false,
    selectable: true,
    deletable: false,
    data: { wire },
    label: wire.pinned ? "pinned" : undefined,
  }));
}
