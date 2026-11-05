/**
 * FE-16: Mirror transform tests
 */

import { describe, expect, it } from "vitest";

type Block = {
  id: string;
  position: [number, number];
  rotation: number;
  mirror: "none" | "x" | "y";
  params: Record<string, unknown>;
};

type Mirror = (blocks: Block[], axis: "x" | "y") => Block[];

let mirrorFn: Mirror | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./mirror");
  mirrorFn = mod.mirrorBlocks ?? mod.mirror ?? mod.default;
  if (mirrorFn !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-16: mirror transform", () => {
  skip("mirror y: sets mirror to y", () => {
    const block = {
      id: "b1",
      position: [0, 0] as [number, number],
      rotation: 0,
      mirror: "none" as const,
      params: {},
    };
    const result = mirrorFn?.([block], "y")[0];
    expect(result.mirror).toBe("y");
  });

  skip("mirror y twice returns to none", () => {
    const block = {
      id: "b1",
      position: [0, 0] as [number, number],
      rotation: 0,
      mirror: "none" as const,
      params: {},
    };
    const step1 = mirrorFn?.([block], "y")[0];
    const step2 = mirrorFn?.([step1], "y")[0];
    expect(step2.mirror).toBe("none");
  });

  skip("mirror does not change position or rotation", () => {
    const block = {
      id: "b1",
      position: [10, 20] as [number, number],
      rotation: 90,
      mirror: "none" as const,
      params: { k: 3 },
    };
    const result = mirrorFn?.([block], "x")[0];
    expect(result.position).toEqual([10, 20]);
    expect(result.rotation).toBe(90);
    expect(result.params).toEqual({ k: 3 });
  });
});
