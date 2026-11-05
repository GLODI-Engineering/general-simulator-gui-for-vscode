import { loadCatalog } from "../library/catalog-core";
import { useLibraryStore } from "../store/library";
import { useSymbolEditorStore } from "./store";

// FE-175: builds a GSF-shaped BlockMetadata (symbol.shape: "primitives",
// BE-71) from the current draft and merges it into the running catalog via
// catalog-core.ts's loadCatalog() — the same validating loader
// NewSymbolDialog used before it was replaced by this editor, reused
// rather than reimplemented.

export type SaveResult = { ok: true; name: string } | { ok: false; error: string };

export function saveSymbolToLibrary(): SaveResult {
  const state = useSymbolEditorStore.getState();

  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(state.name)) {
    return { ok: false, error: 'Type ID must be dotted lower-case, e.g. "user.my_component".' };
  }
  if (!state.label.trim()) {
    return { ok: false, error: "Label is required." };
  }
  if (state.primitives.length === 0) {
    return { ok: false, error: "Draw at least one shape before saving." };
  }
  if (state.ports.length === 0) {
    return { ok: false, error: "Place at least one port before saving." };
  }

  const inputs = state.ports
    .filter((p) => p.direction === "input")
    .map((p) => ({
      id: p.id,
      label: p.label,
      kind: { domain: p.kind },
      side: p.side,
      offset: p.offset,
    }));
  const outputs = state.ports
    .filter((p) => p.direction === "output")
    .map((p) => ({
      id: p.id,
      label: p.label,
      kind: { domain: p.kind },
      side: p.side,
      offset: p.offset,
    }));

  const metadata = {
    name: state.name,
    label: state.label,
    version: 1 as const,
    category: state.category,
    description: state.description || state.label,
    paradigm: state.paradigm,
    domain: state.domain,
    aliases: [],
    tags: [],
    fidelities: [
      { tier: "n_a" as const, ports: [], params: [], doc: "User-authored symbol (Symbol Editor)." },
    ],
    ports: { inputs, outputs },
    params: [],
    symbol: {
      bbox: [state.bboxW, state.bboxH] as [number, number],
      shape: "primitives" as const,
      primitives: state.primitives,
    },
    behavior: {
      causality: "acausal" as const,
      domain: state.behaviorDomain,
      state_count: 0,
      equation_template: state.name,
    },
  };

  try {
    const current = useLibraryStore.getState().catalog;
    const uniqueMetadatas = [...new Set(Object.values(current))];
    const updated = loadCatalog([...uniqueMetadatas, metadata]);
    useLibraryStore.getState().setCatalog(updated);
    return { ok: true, name: state.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save symbol." };
  }
}
