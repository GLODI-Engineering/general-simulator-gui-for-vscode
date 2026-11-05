export type GotoVisibility = "local" | "scoped" | "global";

export type RoutingBlock = {
  id: string;
  type: string;
  params?: { tag?: string; visibility?: GotoVisibility };
  parentId?: string;
};

export type RoutingModel = {
  blocks: RoutingBlock[];
};

export type ResolveResult =
  | { id: string }
  | { error: "unresolved" | "ambiguous"; candidates?: string[] };

function ancestors(id: string | undefined, byId: Map<string, RoutingBlock>): Set<string> {
  const out = new Set<string>();
  let cur = id;
  while (cur) {
    out.add(cur);
    cur = byId.get(cur)?.parentId;
  }
  return out;
}

function visibilityOf(block: RoutingBlock): GotoVisibility {
  const v = block.params?.visibility;
  if (v === "local" || v === "scoped" || v === "global") return v;
  return "local";
}

function tagOf(block: RoutingBlock): string {
  return String(block.params?.tag ?? "").trim();
}

function isGoto(block: RoutingBlock): boolean {
  return block.type === "routing.goto";
}

function isFrom(block: RoutingBlock): boolean {
  return block.type === "routing.from";
}

function visibleToFrom(
  gotoBlock: RoutingBlock,
  fromBlock: RoutingBlock,
  byId: Map<string, RoutingBlock>,
): boolean {
  const vis = visibilityOf(gotoBlock);
  if (vis === "global") return true;

  const gotoParent = gotoBlock.parentId;
  const fromParent = fromBlock.parentId;

  if (vis === "local") {
    return gotoParent === fromParent;
  }

  // scoped: visible in same subsystem and descendants of goto's parent
  if (!gotoParent) {
    // root-scoped behaves like root-global within hierarchy roots only
    return true;
  }
  if (fromParent === gotoParent) return true;
  const fromAnc = ancestors(fromParent, byId);
  return fromAnc.has(gotoParent);
}

export function resolveFrom(fromBlockId: string, model: RoutingModel): ResolveResult {
  const byId = new Map(model.blocks.map((b) => [b.id, b]));
  const from = byId.get(fromBlockId);
  if (!from || !isFrom(from)) return { error: "unresolved" };

  const tag = tagOf(from);
  if (!tag) return { error: "unresolved" };

  const candidates = model.blocks.filter(
    (b) => isGoto(b) && tagOf(b) === tag && visibleToFrom(b, from, byId),
  );

  if (candidates.length === 0) return { error: "unresolved" };
  if (candidates.length > 1) return { error: "ambiguous", candidates: candidates.map((c) => c.id) };
  // candidates.length === 1 is guaranteed by the checks above, so the element exists.
  // biome-ignore lint/style/noNonNullAssertion: length checked on lines 83-84
  return { id: candidates[0]!.id };
}

export default resolveFrom;
