import type { Block } from "../../model/types";

interface NudgeOptions {
  shift: boolean;
  gridStep: number;
  context: "selection" | "in-place-edit" | string;
}

export function nudge(blocks: Block[], key: string, options: NudgeOptions): Block[] | null {
  if (options.context === "in-place-edit") {
    return null;
  }

  const step = options.gridStep * (options.shift ? 10 : 1);
  const delta: Record<string, [number, number]> = {
    ArrowRight: [step, 0],
    ArrowLeft: [-step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };

  const movement = delta[key];
  if (!movement) {
    return blocks;
  }

  return blocks.map((block) => ({
    ...block,
    position: [block.position[0] + movement[0], block.position[1] + movement[1]],
  }));
}

export default nudge;
