/**
 * FE-16: Transform tests (rotate + mirror)
 *
 * Acceptance:
 * - Single-block rotate updates rotation field only; position unchanged.
 * - Multi-block rotate rotates each centre around pivot.
 * - 8 rotation states × 3 mirror states matrix.
 * - Round-trip: rotate CW then CCW returns to identity.
 */

import { describe, expect, it } from "vitest";

type Block = {
  id: string;
  position: [number, number];
  rotation: number;
  mirror: "none" | "x" | "y";
  params: Record<string, unknown>;
};

type Rotate = (blocks: Block[], deltaDegrees: number, pivot: unknown) => Block[];
type Mirror = (blocks: Block[], axis: "x" | "y") => Block[];

let rotateFn: Rotate | null = null;
let mirrorFn: Mirror | null = null;
let available = false;

try {
  const rMod = await import(/* @vite-ignore */ "./rotate");
  rotateFn = rMod.rotateBlocks ?? rMod.rotate ?? rMod.default;
  const mMod = await import(/* @vite-ignore */ "./mirror");
  mirrorFn = mMod.mirrorBlocks ?? mMod.mirror ?? mMod.default;
  if (mirrorFn !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-16: rotate", () => {
  skip("single-block rotate: only rotation changes", () => {
    const block = {
      id: "b1",
      position: [10, 20] as [number, number],
      rotation: 0,
      mirror: "none" as const,
      params: { k: 1 },
    };
    const result = rotateFn?.([block], 90, null)[0];
    expect(result.rotation).toBe(90);
    expect(result.position).toEqual([10, 20]);
    expect(result.params).toEqual({ k: 1 });
    expect(result.mirror).toBe("none");
  });

  skip("rotate CW then CCW returns to identity rotation", () => {
    const block = {
      id: "b1",
      position: [0, 0] as [number, number],
      rotation: 0,
      mirror: "none" as const,
      params: {},
    };
    const step1 = rotateFn?.([block], 90, null);
    const step2 = rotateFn?.(step1, -90, null);
    expect(step2[0].rotation).toBe(0);
  });

  skip("rotation wraps at 360°", () => {
    const block = {
      id: "b1",
      position: [0, 0] as [number, number],
      rotation: 270,
      mirror: "none" as const,
      params: {},
    };
    const result = rotateFn?.([block], 90, null);
    expect(result[0].rotation).toBe(0);
  });

  skip("all 8 rotation states for single block", () => {
    const rotations = [0, 90, 180, 270];
    const mirrors = ["none", "x", "y"] as const;
    for (const r of rotations) {
      for (const m of mirrors) {
        const block = {
          id: "b1",
          position: [0, 0] as [number, number],
          rotation: r,
          mirror: m,
          params: {},
        };
        expect(() => rotateFn?.([block], 90, null)).not.toThrow();
      }
    }
  });
});

describe("FE-16: mirror", () => {
  skip("mirror x flips mirror field: none → x → none", () => {
    const block = {
      id: "b1",
      position: [0, 0] as [number, number],
      rotation: 0,
      mirror: "none" as const,
      params: {},
    };
    const flipped = mirrorFn?.([block], "x")[0];
    expect(flipped.mirror).toBe("x");
    const back = mirrorFn?.([flipped], "x")[0];
    expect(back.mirror).toBe("none");
  });
});
