export interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function normalizeRect(rect: MarqueeRect) {
  const minX = Math.min(rect.x, rect.x + rect.width);
  const maxX = Math.max(rect.x, rect.x + rect.width);
  const minY = Math.min(rect.y, rect.y + rect.height);
  const maxY = Math.max(rect.y, rect.y + rect.height);
  return { minX, maxX, minY, maxY };
}

export function computeMarqueeSelection(
  rect: MarqueeRect,
  blocks: Array<{ id: string; position: [number, number] }>,
  wires: Array<{ id: string; from: { block: string }; to: { block: string } }>,
) {
  const bounds = normalizeRect(rect);
  const selectedBlocks = blocks
    .filter(
      (block) =>
        block.position[0] >= bounds.minX &&
        block.position[0] <= bounds.maxX &&
        block.position[1] >= bounds.minY &&
        block.position[1] <= bounds.maxY,
    )
    .map((block) => block.id);

  const selectedSet = new Set(selectedBlocks);
  const selectedWires = wires
    .filter((wire) => selectedSet.has(wire.from.block) && selectedSet.has(wire.to.block))
    .map((wire) => wire.id);

  return { blocks: selectedBlocks, wires: selectedWires };
}

export function selectAll(
  blocks: Array<{ id: string }>,
  wires: Array<{ id: string; from: { block: string }; to: { block: string } }>,
  selectedBlocks = new Set(blocks.map((block) => block.id)),
) {
  return {
    blocks: [...selectedBlocks],
    wires: wires
      .filter((wire) => selectedBlocks.has(wire.from.block) && selectedBlocks.has(wire.to.block))
      .map((wire) => wire.id),
  };
}
