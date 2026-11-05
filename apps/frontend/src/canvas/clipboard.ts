import type { Block, Wire } from "../model/types";

interface ClipboardPayload {
  blocks: Block[];
  wires: Wire[];
}

function rewriteId(id: string): string {
  return `${id}-${crypto.randomUUID()}`;
}

export function copySelection(
  blocks: Block[],
  wires: Wire[],
  selection: Set<string>,
): ClipboardPayload {
  const copiedBlocks = blocks.filter((block) => selection.has(block.id));
  const blockIds = new Set(copiedBlocks.map((block) => block.id));
  const copiedWires = wires.filter(
    (wire) => blockIds.has(wire.from.block) && blockIds.has(wire.to.block),
  );
  return { blocks: structuredClone(copiedBlocks), wires: structuredClone(copiedWires) };
}

export function pasteSelection(payload: ClipboardPayload, offset: { x: number; y: number }) {
  const blockIdMap = new Map<string, string>();
  const blocks = payload.blocks.map((block) => {
    const id = rewriteId(block.id);
    blockIdMap.set(block.id, id);
    return {
      ...structuredClone(block),
      id,
      position: [
        Math.round(block.position[0] + offset.x),
        Math.round(block.position[1] + offset.y),
      ] as [number, number],
    };
  });

  const wires = payload.wires.map((wire) => ({
    ...structuredClone(wire),
    id: rewriteId(wire.id),
    from: { ...wire.from, block: blockIdMap.get(wire.from.block) ?? wire.from.block },
    to: { ...wire.to, block: blockIdMap.get(wire.to.block) ?? wire.to.block },
  }));

  return { blocks, wires };
}

export function cutSelection(blocks: Block[], wires: Wire[], selection: Set<string>) {
  return copySelection(blocks, wires, selection);
}
