import type { Block } from "../../model/types";

export function mirrorBlocks(blocks: Block[], axis: "x" | "y"): Block[] {
  return blocks.map((block) => ({
    ...block,
    mirror: block.mirror === axis ? "none" : axis,
  }));
}

export const mirror = mirrorBlocks;

export default mirrorBlocks;
