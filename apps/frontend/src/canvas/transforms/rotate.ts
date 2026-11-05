import type { Block } from "../../model/types";

function normalizeRotation(rotation: number): Block["rotation"] {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

export function rotateBlocks(
  blocks: Block[],
  angle: number,
  pivot: [number, number] | null,
): Block[] {
  if (blocks.length === 1 || pivot === null) {
    return blocks.map((block) => ({
      ...block,
      rotation: normalizeRotation(block.rotation + angle),
    }));
  }

  const radians = (angle * Math.PI) / 180;
  const [px, py] = pivot;
  return blocks.map((block) => {
    const dx = block.position[0] - px;
    const dy = block.position[1] - py;
    const x = Math.round(px + dx * Math.cos(radians) - dy * Math.sin(radians));
    const y = Math.round(py + dx * Math.sin(radians) + dy * Math.cos(radians));
    return {
      ...block,
      position: [x, y],
      rotation: normalizeRotation(block.rotation + angle),
    };
  });
}

export const rotate = rotateBlocks;

export default rotateBlocks;
