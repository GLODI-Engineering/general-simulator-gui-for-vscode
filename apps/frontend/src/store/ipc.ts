import { create } from "zustand";

import type { DcOpEntry, SimulationManifest, WaveformSlice, WorkspaceVariable } from "../ipc/types";

export type KernelStatus = "disconnected" | "connecting" | "idle" | "busy" | "running" | "error";

export interface PendingRequest {
  action: string;
  startedAt: number;
}

export interface ProblemEntry {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface IpcStoreState {
  status: KernelStatus;
  pendingIds: Map<string, PendingRequest>;
  lastManifest: SimulationManifest | null;
  workspaceVariables: WorkspaceVariable[];
  waveformSlice: WaveformSlice | null;
  dcOpTable: DcOpEntry[] | null;
  output: string[];
  problems: ProblemEntry[];
  activeEditorTabId: string;
  simProgress: number | null;
  simMessage: string | null;
  /** The exact netlist text last sent to the backend (schematic-generated or imported). */
  lastNetlist: string | null;
  /**
   * When set, triggerRun() sends this text directly instead of generating a
   * netlist from the schematic. Set by File > Import SPICE netlist…; cleared
   * from the Netlist tab.
   */
  importedNetlist: string | null;
  setStatus: (status: KernelStatus) => void;
  setPending: (id: string, request: PendingRequest) => void;
  clearPending: (id: string) => void;
  setLastManifest: (manifest: SimulationManifest | null) => void;
  /**
   * FE-154: called as soon as the first waveform_chunk binary frame for a
   * signal arrives — i.e. while the simulation is still running, well
   * before the final simulate_result (and its authoritative manifest)
   * shows up. Lets the SignalBrowser sidebar list signals live as they
   * start streaming instead of staying empty for the whole run. Harmless
   * if called after the real manifest already landed (dedup by name).
   */
  registerLiveSignal: (simId: string, signalName: string) => void;
  setWorkspaceVariables: (variables: WorkspaceVariable[]) => void;
  setWaveformSlice: (slice: WaveformSlice | null) => void;
  setDcOpTable: (table: DcOpEntry[] | null) => void;
  appendOutput: (line: string) => void;
  setProblems: (problems: ProblemEntry[]) => void;
  setActiveEditorTab: (id: string) => void;
  setSimProgress: (frac: number | null, message?: string | null) => void;
  setLastNetlist: (netlist: string | null) => void;
  setImportedNetlist: (netlist: string | null) => void;
  /**
   * Called from file/file-ops.ts on New/Open/Open-by-id. Simulation state
   * (progress, manifest, netlist, problems) belongs to whichever model
   * produced it — opening a different model must not leave the Run button
   * stuck showing "Stop" for a run against a model that's no longer even
   * loaded, nor show stale results/errors from the model just left behind.
   * Only clears a stuck "busy" (there's no in-flight request left to
   * finish once the model backing it is gone); leaves a genuine
   * disconnected/connecting/error kernel-connection status alone, since
   * that reflects the backend connection, not the loaded model.
   */
  resetForNewModel: () => void;
}

export const useIpcStore = create<IpcStoreState>((set, get) => ({
  status: "disconnected",
  pendingIds: new Map<string, PendingRequest>(),
  lastManifest: null,
  workspaceVariables: [],
  waveformSlice: null,
  dcOpTable: null,
  output: [],
  problems: [],
  activeEditorTabId: "core.schematic",
  simProgress: null,
  simMessage: null,
  lastNetlist: null,
  importedNetlist: null,
  setStatus: (status) => {
    const previous = get().status;
    const manifest = get().lastManifest;
    if (status === "idle" && previous !== "idle" && manifest !== null) {
      set({ status, activeEditorTabId: "core.waveform" });
    } else {
      set({ status });
    }
  },
  setPending: (id, request) => {
    set((state) => {
      const pendingIds = new Map(state.pendingIds);
      pendingIds.set(id, request);
      return { pendingIds };
    });
  },
  clearPending: (id) => {
    set((state) => {
      const pendingIds = new Map(state.pendingIds);
      pendingIds.delete(id);
      return { pendingIds };
    });
  },
  setLastManifest: (lastManifest) => {
    set({ lastManifest });
  },
  registerLiveSignal: (simId, signalName) => {
    set((state) => {
      const current = state.lastManifest;
      if (current && current.sim_id === simId) {
        if (current.signals.includes(signalName)) return {};
        return { lastManifest: { ...current, signals: [...current.signals, signalName] } };
      }
      // First signal of a new run — start a provisional manifest.
      // t_start/t_end are unknown until the final simulate_result arrives
      // and setLastManifest() replaces this with the authoritative one.
      return { lastManifest: { sim_id: simId, signals: [signalName], t_start: 0, t_end: 0 } };
    });
  },
  setWorkspaceVariables: (workspaceVariables) => {
    set({ workspaceVariables });
  },
  setWaveformSlice: (waveformSlice) => {
    set({ waveformSlice });
  },
  setDcOpTable: (dcOpTable) => {
    set({ dcOpTable });
  },
  appendOutput: (line) => {
    set((state) => ({ output: [...state.output, line] }));
  },
  setProblems: (problems) => {
    set({ problems });
  },
  setActiveEditorTab: (id) => {
    set({ activeEditorTabId: id });
  },
  setSimProgress: (frac, message) => {
    set({ simProgress: frac, simMessage: message ?? null });
  },
  setLastNetlist: (lastNetlist) => {
    set({ lastNetlist });
  },
  setImportedNetlist: (importedNetlist) => {
    set({ importedNetlist });
  },
  resetForNewModel: () => {
    set((state) => ({
      status: state.status === "busy" ? "idle" : state.status,
      simProgress: null,
      simMessage: null,
      lastManifest: null,
      lastNetlist: null,
      importedNetlist: null,
      dcOpTable: null,
      problems: [],
    }));
  },
}));
