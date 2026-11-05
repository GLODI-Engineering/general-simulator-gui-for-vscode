import { create } from "zustand";

export interface InspectorDraftValue {
  value: unknown;
  dirty: boolean;
  error: string | null;
}

export interface InspectorStoreState {
  boundSelection: string[];
  drafts: Record<string, InspectorDraftValue>;
  bindSelection: (ids: string[]) => void;
  setDraft: (key: string, value: unknown, error?: string | null) => void;
  clearDraft: (key: string) => void;
  clearDrafts: () => void;
}

export const useInspectorStore = create<InspectorStoreState>((set) => ({
  boundSelection: [],
  drafts: {},
  bindSelection: (ids) => {
    set({ boundSelection: [...ids] });
  },
  setDraft: (key, value, error = null) => {
    set((state) => ({
      drafts: {
        ...state.drafts,
        [key]: { value, dirty: true, error },
      },
    }));
  },
  clearDraft: (key) => {
    set((state) => {
      const drafts = { ...state.drafts };
      delete drafts[key];
      return { drafts };
    });
  },
  clearDrafts: () => {
    set({ drafts: {} });
  },
}));
