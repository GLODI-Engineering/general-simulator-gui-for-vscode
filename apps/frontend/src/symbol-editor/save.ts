import { isVsCodeHost, postToHost } from "../ipc/vscode-host";
import { loadCatalog } from "../library/catalog-core";
import { useLibraryStore } from "../store/library";
import { useSymbolEditorStore } from "./store";

// FE-175: builds a GSF-shaped BlockMetadata (symbol.shape: "primitives",
// BE-71) from the current draft and merges it into the running catalog via
// catalog-core.ts's loadCatalog() — the same validating loader
// NewSymbolDialog used before it was replaced by this editor, reused
// rather than reimplemented.

export type SaveResult =
  | { ok: true; name: string; persisted: boolean }
  | { ok: false; error: string };

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

    // Merging into the running catalog is not saving. Until this existed, an
    // authored component lived only in this webview's memory: reload the
    // window and it was gone, with no file to recover it from and nothing to
    // share or commit. The host writes it to `.gsim/symbols/<name>.gsim_sym`
    // and reports back through `gsim/symbolSaved` / `gsim/symbolSaveFailed`.
    const persisted = isVsCodeHost();
    if (persisted) {
      postToHost({ type: "gsim/saveSymbol", name: state.name, metadata });
    }
    return { ok: true, name: state.name, persisted };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save symbol." };
  }
}

/**
 * Merge the workspace's components into the running catalog.
 *
 * Called with whatever the host read from disk, at boot and whenever the
 * symbols folder changes. Built-in types win on a name collision: a user
 * file must not be able to redefine `passive.resistor` out from under every
 * document that uses it.
 */
export function mergeUserSymbols(symbols: unknown[]): number {
  if (symbols.length === 0) {
    return 0;
  }
  const current = useLibraryStore.getState().catalog;
  const builtInNames = new Set(Object.values(current).map((entry) => entry.name));
  const incoming = symbols.filter(
    (entry): entry is { name: string } =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { name?: unknown }).name === "string" &&
      !builtInNames.has((entry as { name: string }).name),
  );
  if (incoming.length === 0) {
    return 0;
  }
  const uniqueMetadatas = [...new Set(Object.values(current))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated = loadCatalog([...uniqueMetadatas, ...(incoming as any[])]);
  useLibraryStore.getState().setCatalog(updated);
  return incoming.length;
}
