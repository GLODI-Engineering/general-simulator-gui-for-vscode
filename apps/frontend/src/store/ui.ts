import { create } from "zustand";

export type ActivityId = "core.explorer" | "core.search" | "core.library" | "core.problems";
export type BottomTabId = "core.waveform" | "core.workspace" | "core.output" | "core.problems";
export type AnnotationTool = "text" | "polyline" | "rectangle" | "ellipse";
export type CanvasTool = "select" | "wire" | "annotate" | "pan" | "label";

const CANVAS_BG_STORAGE_KEY = "gensim.ui.canvas-bg.v1";

export type CanvasBackground = "white" | "light" | "cream" | "dark";

const CANVAS_BG_VALUES: ReadonlySet<CanvasBackground> = new Set([
  "white",
  "light",
  "cream",
  "dark",
]);

function loadCanvasBackground(): CanvasBackground {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return "light";
  }
  try {
    const raw = globalThis.localStorage.getItem(CANVAS_BG_STORAGE_KEY);
    return raw && CANVAS_BG_VALUES.has(raw as CanvasBackground)
      ? (raw as CanvasBackground)
      : "light";
  } catch {
    return "light";
  }
}

function persistCanvasBackground(value: CanvasBackground): void {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return;
  }
  try {
    globalThis.localStorage.setItem(CANVAS_BG_STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

export interface UiStoreState {
  selection: Set<string>;
  selectedWireIds: Set<string>;
  setSelectedWireIds: (ids: Iterable<string>) => void;
  /** IDs of probes currently selected in the canvas probe overlay. */
  selectedProbeIds: Set<string>;
  toggleProbeSelection: (probeId: string) => void;
  clearProbeSelection: () => void;
  hierarchyPath: string[];
  hierarchyHistory: string[][];
  hierarchyHistoryIndex: number;
  zoom: number;
  pan: { x: number; y: number };
  primarySideBarVisible: boolean;
  secondarySideBarVisible: boolean;
  bottomPanelVisible: boolean;
  activeActivityId: ActivityId;
  activeBottomTabId: BottomTabId;
  primarySideBarWidth: number;
  secondarySideBarWidth: number;
  bottomPanelHeight: number;
  libraryTreeExpanded: Record<string, boolean>;
  modalStack: string[];
  annotationTool: AnnotationTool | null;
  canvasTool: CanvasTool;
  /** FE-65: whether the signal-dimension overlay is visible */
  showDimLabels: boolean;
  canvasBackground: CanvasBackground;
  /** Block id whose parameter panel is currently open (double-click target). */
  paramPanelBlockId: string | null;
  addSelection: (id: string) => void;
  removeSelection: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  setSelection: (ids: Iterable<string>) => void;
  enterSubsystem: (id: string) => void;
  leaveSubsystem: () => void;
  popHierarchyTo: (index: number) => void;
  navBack: () => void;
  navForward: () => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  togglePrimarySideBar: () => void;
  toggleSecondarySideBar: () => void;
  toggleBottomPanel: () => void;
  focusActivity: (id: ActivityId) => void;
  focusBottomTab: (id: BottomTabId) => void;
  setPrimarySideBarWidth: (width: number) => void;
  setSecondarySideBarWidth: (width: number) => void;
  setBottomPanelHeight: (height: number) => void;
  setLibraryTreeExpanded: (id: string, expanded: boolean) => void;
  pushModal: (id: string) => void;
  popModal: () => void;
  setAnnotationTool: (tool: AnnotationTool | null) => void;
  setCanvasTool: (tool: CanvasTool) => void;
  /** FE-65: toggle the signal-dimension overlay */
  toggleDimLabels: () => void;
  setCanvasBackground: (bg: CanvasBackground) => void;
  openParamPanel: (blockId: string) => void;
  closeParamPanel: () => void;
  currentFilePath: string | null;
  setCurrentFilePath: (path: string | null) => void;
}

function clampSize(value: number, minimum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.round(value)) : minimum;
}

export const useUiStore = create<UiStoreState>((set) => ({
  selection: new Set<string>(),
  selectedWireIds: new Set<string>(),
  setSelectedWireIds: (ids) => set({ selectedWireIds: new Set(ids) }),
  selectedProbeIds: new Set<string>(),
  toggleProbeSelection: (probeId) =>
    set((state) => {
      const next = new Set(state.selectedProbeIds);
      if (next.has(probeId)) {
        next.delete(probeId);
      } else {
        next.add(probeId);
      }
      return { selectedProbeIds: next };
    }),
  clearProbeSelection: () => set({ selectedProbeIds: new Set<string>() }),
  hierarchyPath: [],
  hierarchyHistory: [[]],
  hierarchyHistoryIndex: 0,
  zoom: 1,
  pan: { x: 0, y: 0 },
  primarySideBarVisible: true,
  secondarySideBarVisible: false,
  bottomPanelVisible: false,
  activeActivityId: "core.library",
  activeBottomTabId: "core.waveform",
  primarySideBarWidth: 280,
  secondarySideBarWidth: 320,
  bottomPanelHeight: 240,
  libraryTreeExpanded: {},
  modalStack: [],
  annotationTool: null,
  canvasTool: "select",
  showDimLabels: false,
  canvasBackground: loadCanvasBackground(),
  paramPanelBlockId: null,
  addSelection: (id) => {
    set((state) => ({ selection: new Set(state.selection).add(id) }));
  },
  removeSelection: (id) => {
    set((state) => {
      const selection = new Set(state.selection);
      selection.delete(id);
      return { selection };
    });
  },
  toggleSelection: (id) => {
    set((state) => {
      const selection = new Set(state.selection);
      if (selection.has(id)) {
        selection.delete(id);
      } else {
        selection.add(id);
      }
      return { selection };
    });
  },
  clearSelection: () => {
    set({ selection: new Set<string>() });
  },
  setSelection: (ids) => {
    set((state) => {
      const next = new Set(ids);
      const current = state.selection;
      if (next.size === current.size && [...next].every((id) => current.has(id))) return {};
      return { selection: next };
    });
  },
  enterSubsystem: (id) => {
    set((state) => {
      const nextPath = [...state.hierarchyPath, id];
      const nextHistory = [
        ...state.hierarchyHistory.slice(0, state.hierarchyHistoryIndex + 1),
        nextPath,
      ];
      return {
        hierarchyPath: nextPath,
        hierarchyHistory: nextHistory,
        hierarchyHistoryIndex: nextHistory.length - 1,
        selection: new Set<string>(),
      };
    });
  },
  leaveSubsystem: () => {
    set((state) => {
      if (state.hierarchyPath.length === 0) {
        return {};
      }
      const nextPath = state.hierarchyPath.slice(0, -1);
      const nextHistory = [
        ...state.hierarchyHistory.slice(0, state.hierarchyHistoryIndex + 1),
        nextPath,
      ];
      return {
        hierarchyPath: nextPath,
        hierarchyHistory: nextHistory,
        hierarchyHistoryIndex: nextHistory.length - 1,
        selection: new Set<string>(),
      };
    });
  },
  popHierarchyTo: (index) => {
    set((state) => {
      const bounded = Math.max(0, Math.min(index, state.hierarchyPath.length));
      const nextPath = state.hierarchyPath.slice(0, bounded);
      const nextHistory = [
        ...state.hierarchyHistory.slice(0, state.hierarchyHistoryIndex + 1),
        nextPath,
      ];
      return {
        hierarchyPath: nextPath,
        hierarchyHistory: nextHistory,
        hierarchyHistoryIndex: nextHistory.length - 1,
        selection: new Set<string>(),
      };
    });
  },
  navBack: () => {
    set((state) => {
      if (state.hierarchyHistoryIndex <= 0) {
        return {};
      }
      const nextIndex = state.hierarchyHistoryIndex - 1;
      return {
        hierarchyHistoryIndex: nextIndex,
        hierarchyPath: [...(state.hierarchyHistory[nextIndex] ?? [])],
        selection: new Set<string>(),
      };
    });
  },
  navForward: () => {
    set((state) => {
      if (state.hierarchyHistoryIndex >= state.hierarchyHistory.length - 1) {
        return {};
      }
      const nextIndex = state.hierarchyHistoryIndex + 1;
      return {
        hierarchyHistoryIndex: nextIndex,
        hierarchyPath: [...(state.hierarchyHistory[nextIndex] ?? [])],
        selection: new Set<string>(),
      };
    });
  },
  setZoom: (zoom) => {
    set({ zoom });
  },
  setPan: (pan) => {
    set({ pan });
  },
  togglePrimarySideBar: () => {
    set((state) => ({ primarySideBarVisible: !state.primarySideBarVisible }));
  },
  toggleSecondarySideBar: () => {
    set((state) => ({ secondarySideBarVisible: !state.secondarySideBarVisible }));
  },
  toggleBottomPanel: () => {
    set((state) => ({ bottomPanelVisible: !state.bottomPanelVisible }));
  },
  focusActivity: (id) => {
    set({ activeActivityId: id, primarySideBarVisible: true });
  },
  focusBottomTab: (id) => {
    set({ activeBottomTabId: id, bottomPanelVisible: true });
  },
  setPrimarySideBarWidth: (width) => {
    set({ primarySideBarWidth: clampSize(width, 200) });
  },
  setSecondarySideBarWidth: (width) => {
    set({ secondarySideBarWidth: clampSize(width, 240) });
  },
  setBottomPanelHeight: (height) => {
    set({ bottomPanelHeight: clampSize(height, 160) });
  },
  setLibraryTreeExpanded: (id, expanded) => {
    set((state) => ({ libraryTreeExpanded: { ...state.libraryTreeExpanded, [id]: expanded } }));
  },
  pushModal: (id) => {
    set((state) => ({ modalStack: [...state.modalStack, id] }));
  },
  popModal: () => {
    set((state) => ({ modalStack: state.modalStack.slice(0, -1) }));
  },
  setAnnotationTool: (tool) => {
    set({ annotationTool: tool });
  },
  setCanvasTool: (tool) => {
    set({ canvasTool: tool });
  },
  toggleDimLabels: () => {
    set((state) => ({ showDimLabels: !state.showDimLabels }));
  },
  setCanvasBackground: (bg) => {
    persistCanvasBackground(bg);
    set({ canvasBackground: bg });
  },
  openParamPanel: (blockId) => {
    set((state) => ({
      paramPanelBlockId: blockId,
      modalStack: state.modalStack.includes("component-params")
        ? state.modalStack
        : [...state.modalStack, "component-params"],
    }));
  },
  closeParamPanel: () => {
    set((state) => ({
      paramPanelBlockId: null,
      modalStack: state.modalStack.filter((id) => id !== "component-params"),
    }));
  },
  currentFilePath: null,
  setCurrentFilePath: (path) => {
    set({ currentFilePath: path });
  },
}));
