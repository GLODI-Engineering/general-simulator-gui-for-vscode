import type { Block, BlockMetadata } from "../model/types";
import { SYMBOL_SCALE } from "./nodes/port-hit-test";
import { resolveBlockBbox } from "./nodes/resolve-ports";

export interface BlockBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Model-space bounding box for a block: position is the top-left anchor,
 * width/height come from the catalog symbol's bbox with the same 90/270
 * rotation swap and SYMBOL_SCALE factor used by BlockNode.tsx and
 * derive-flow-state.ts, so it stays in the same coordinate space as
 * block.position and wire routing.
 */
export function getBlockBoundingBox(
  block: Block,
  metadata: BlockMetadata | null,
): BlockBoundingBox {
  const baseBbox: [number, number] =
    block.type === "routing.junction"
      ? [1, 1]
      : metadata
        ? resolveBlockBbox(metadata, block.params)
        : [96, 48];
  const rotated = block.rotation === 90 || block.rotation === 270;
  const width = (rotated ? baseBbox[1] : baseBbox[0]) * SYMBOL_SCALE;
  const height = (rotated ? baseBbox[0] : baseBbox[1]) * SYMBOL_SCALE;
  return { x: block.position[0], y: block.position[1], width, height };
}
