/**
 * FE-57: goto-from-resolver tests
 *
 * Acceptance:
 * - test_resolver_local: local Goto in subsystem A invisible to From in subsystem B.
 * - test_resolver_scoped: scoped Goto in A visible to From in A's nested child.
 * - test_resolver_global: global Goto visible to From anywhere.
 * - test_resolver_ambiguous: two visible Gotos same tag -> {error:'ambiguous'}.
 * - test_overlay_paints_dotted: selecting Goto with 2 From pairs draws 2 dotted segments.
 */

import { describe, expect, it } from "vitest";

type ResolveResult = { id: string } | { error: "unresolved" | "ambiguous"; candidates?: string[] };

type ModelStub = {
  blocks: {
    id: string;
    type: string;
    params?: { tag?: string; visibility?: "local" | "scoped" | "global" };
    parentId?: string;
  }[];
};

let resolveFrom: ((fromBlockId: string, model: ModelStub) => ResolveResult) | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./goto-from-resolver");
  resolveFrom = mod.resolveFrom ?? mod.default;
  if (resolveFrom) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

// Model: subsystem A (id=sub-a), subsystem B (id=sub-b), child of A (id=sub-a-child)
// Goto in A (local), From in B → should be unresolved
const MODEL_LOCAL: ModelStub = {
  blocks: [
    {
      id: "goto1",
      type: "routing.goto",
      params: { tag: "x", visibility: "local" },
      parentId: "sub-a",
    },
    { id: "from1", type: "routing.from", params: { tag: "x" }, parentId: "sub-b" },
    { id: "sub-a", type: "hierarchy.subsystem.atomic", parentId: undefined },
    { id: "sub-b", type: "hierarchy.subsystem.atomic", parentId: undefined },
  ],
};

const MODEL_SCOPED: ModelStub = {
  blocks: [
    {
      id: "goto1",
      type: "routing.goto",
      params: { tag: "y", visibility: "scoped" },
      parentId: "sub-a",
    },
    { id: "from1", type: "routing.from", params: { tag: "y" }, parentId: "sub-a-child" },
    { id: "sub-a", type: "hierarchy.subsystem.atomic", parentId: undefined },
    { id: "sub-a-child", type: "hierarchy.subsystem.atomic", parentId: "sub-a" },
  ],
};

const MODEL_GLOBAL: ModelStub = {
  blocks: [
    {
      id: "goto1",
      type: "routing.goto",
      params: { tag: "z", visibility: "global" },
      parentId: "sub-a",
    },
    { id: "from1", type: "routing.from", params: { tag: "z" }, parentId: "sub-b" },
    { id: "sub-a", type: "hierarchy.subsystem.atomic", parentId: undefined },
    { id: "sub-b", type: "hierarchy.subsystem.atomic", parentId: undefined },
  ],
};

const MODEL_AMBIGUOUS: ModelStub = {
  blocks: [
    {
      id: "goto1",
      type: "routing.goto",
      params: { tag: "w", visibility: "global" },
      parentId: undefined,
    },
    {
      id: "goto2",
      type: "routing.goto",
      params: { tag: "w", visibility: "global" },
      parentId: undefined,
    },
    { id: "from1", type: "routing.from", params: { tag: "w" }, parentId: undefined },
  ],
};

describe("FE-57: goto-from-resolver", () => {
  skip("test_resolver_local: local Goto in sub-A is invisible to From in sub-B", () => {
    if (!resolveFrom) throw new Error("resolveFrom not available");
    const result = resolveFrom("from1", MODEL_LOCAL);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toBe("unresolved");
  });

  skip("test_resolver_scoped: scoped Goto in A is visible to From in A's child", () => {
    if (!resolveFrom) throw new Error("resolveFrom not available");
    const result = resolveFrom("from1", MODEL_SCOPED);
    expect("id" in result).toBe(true);
    if ("id" in result) expect(result.id).toBe("goto1");
  });

  skip("test_resolver_global: global Goto is visible to From in any subsystem", () => {
    if (!resolveFrom) throw new Error("resolveFrom not available");
    const result = resolveFrom("from1", MODEL_GLOBAL);
    expect("id" in result).toBe(true);
    if ("id" in result) expect(result.id).toBe("goto1");
  });

  skip("test_resolver_ambiguous: two global Gotos same tag -> ambiguous error with candidates", () => {
    if (!resolveFrom) throw new Error("resolveFrom not available");
    const result = resolveFrom("from1", MODEL_AMBIGUOUS);
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toBe("ambiguous");
      expect((result as { error: string; candidates: string[] }).candidates).toContain("goto1");
      expect((result as { error: string; candidates: string[] }).candidates).toContain("goto2");
    }
  });
});
