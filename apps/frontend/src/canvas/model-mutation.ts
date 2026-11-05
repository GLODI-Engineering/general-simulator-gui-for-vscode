import { useGraphStore, useUiStore } from "../store";
import { resolveModelAtPath } from "../store/model";
import type { StructuredSubcktDef } from "./subckt-metadata";

/**
 * FE-157: split out of Canvas.tsx so WireEdge.tsx (a ReactFlow edge
 * component Canvas.tsx itself imports) can mutate the active model — e.g.
 * to commit a wire label — without creating a circular import between the
 * two files.
 */

/** Safe to call from effects / global handlers outside a render. */
export function activeModelFromStore() {
  const { document } = useGraphStore.getState();
  const path = useUiStore.getState().hierarchyPath;
  return resolveModelAtPath(document.model, path) ?? document.model;
}

/**
 * The SubcktDefs visible from the active model: its own, plus the root
 * document's (a subsystem may instantiate a def declared at the top level).
 * Nearest scope wins on an id collision.
 */
export function activeSubcktDefsFromStore(): StructuredSubcktDef[] {
  const { document } = useGraphStore.getState();
  const path = useUiStore.getState().hierarchyPath;
  const active = resolveModelAtPath(document.model, path) ?? document.model;
  const defs: StructuredSubcktDef[] = [...(active.subckt_defs ?? [])];
  if (active !== document.model) {
    for (const def of document.model.subckt_defs ?? []) {
      if (!defs.some((candidate) => candidate.id === def.id)) {
        defs.push(def);
      }
    }
  }
  return defs;
}

export function mutateActiveModelFromStore(
  name: string,
  mutate: (model: ReturnType<typeof activeModelFromStore>) => void,
) {
  const graph = useGraphStore.getState();
  const path = useUiStore.getState().hierarchyPath;
  graph.transact(name, () => {
    graph.mutateModelAtPath(path, (model) => {
      mutate(model);
    });
  });
}
