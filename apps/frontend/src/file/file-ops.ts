import type { ModelDocument } from "../model/types";
import { useGraphStore, useIpcStore, useUiStore } from "../store";
import type { ModelEntry, ModelRef, StorageAdapter } from "./StorageAdapter";
import { selectAdapter } from "./adapters/select-adapter";
import { emit as emitAutosave } from "./autosave";

function syncFilePath(ref: ModelRef | null): void {
  useUiStore.getState().setCurrentFilePath(typeof ref === "string" ? ref : null);
}

export interface FileSessionState {
  adapter: StorageAdapter;
  currentRef: ModelRef | null;
}

const state: FileSessionState = {
  adapter: selectAdapter(),
  currentRef: null,
};

export function getFileSessionState(): FileSessionState {
  return state;
}

export function setStorageAdapter(adapter: StorageAdapter): void {
  state.adapter = adapter;
}

export function setCurrentModelRef(ref: ModelRef | null): void {
  state.currentRef = ref;
  syncFilePath(ref);
}

function createEmptyDocument(): ModelDocument {
  return {
    schema_version: 2,
    model: {
      id: `model-${Date.now()}`,
      name: "Untitled model",
      grid: 10,
      params: [],
      blocks: [],
      wires: [],
      lines: [],
      nets: [],
      simulation: {},
      metadata: {},
    },
  };
}

export async function newFile(options?: {
  confirm?: () => Promise<boolean>;
  clearUndo?: () => void;
  resetStore?: () => void;
}): Promise<boolean> {
  const shouldProceed = (await options?.confirm?.()) ?? true;
  if (!shouldProceed) {
    return false;
  }

  options?.clearUndo?.();
  if (options?.resetStore) {
    options.resetStore();
  } else {
    useGraphStore.getState().loadDocument(createEmptyDocument());
    useGraphStore.getState().clearHistory();
    useUiStore.getState().clearSelection();
  }
  state.currentRef = null;
  syncFilePath(null);
  useIpcStore.getState().resetForNewModel();
  return true;
}

export async function openFile(): Promise<ModelDocument> {
  const { document, ref } = await state.adapter.importFromFile();
  useGraphStore.getState().loadDocument(document);
  useGraphStore.getState().clearHistory();
  state.currentRef = ref;
  syncFilePath(ref);
  useIpcStore.getState().resetForNewModel();
  return document;
}

/** List of recently opened/saved models, newest first — backs File > Recent Files. */
export async function listRecentFiles(): Promise<ModelEntry[]> {
  return state.adapter.list();
}

/**
 * Open a model directly by its storage ref (a File > Recent Files click, or
 * the startup/recent-models picker), as opposed to `openFile()`'s file-picker
 * dialog flow. Unlike a raw `adapter.load()` call, this also updates
 * `state.currentRef`/`currentFilePath` so a subsequent Save writes back to
 * this same ref instead of falling through to Save As.
 */
export async function openFileById(ref: ModelRef): Promise<ModelDocument> {
  const document = await state.adapter.load(ref);
  useGraphStore.getState().loadDocument(document);
  useGraphStore.getState().clearHistory();
  state.currentRef = ref;
  syncFilePath(ref);
  useIpcStore.getState().resetForNewModel();
  return document;
}

export async function saveFile(document = useGraphStore.getState().document): Promise<void> {
  if (state.currentRef) {
    await state.adapter.save(state.currentRef, document);
  } else {
    const ref = await state.adapter.saveAs(document);
    state.currentRef = ref;
    syncFilePath(ref);
  }
  emitAutosave("commit");
}

export async function saveFileAs(document = useGraphStore.getState().document): Promise<ModelRef> {
  const ref = await state.adapter.saveAs(document);
  state.currentRef = ref;
  syncFilePath(ref);
  return ref;
}

export async function exportCurrentModel(
  document = useGraphStore.getState().document,
): Promise<void> {
  await state.adapter.exportToFile(document);
}

export async function closeFile(options?: { confirm?: () => Promise<boolean> }): Promise<boolean> {
  return newFile({ confirm: options?.confirm });
}
