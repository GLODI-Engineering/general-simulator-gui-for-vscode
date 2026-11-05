import { useGraphStore } from "./graph";
import { useInspectorStore } from "./inspector";
import { useIpcStore } from "./ipc";
import { useLibraryStore } from "./library";
import { useSimSettingsStore } from "./sim-settings";
import { useToastStore } from "./toast";
import { useUiStore } from "./ui";
import { useWireColorStore } from "./wire-colors";

export function useStores() {
  return {
    graph: useGraphStore,
    inspector: useInspectorStore,
    ipc: useIpcStore,
    library: useLibraryStore,
    simSettings: useSimSettingsStore,
    ui: useUiStore,
    toast: useToastStore,
    wireColors: useWireColorStore,
  };
}

export {
  useGraphStore,
  useInspectorStore,
  useIpcStore,
  useLibraryStore,
  useSimSettingsStore,
  useUiStore,
  useToastStore,
  useWireColorStore,
};
