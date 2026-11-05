import { create } from "zustand";

import type { BlockMetadata } from "../model/types";

export interface LibraryStoreState {
  catalog: Record<string, BlockMetadata>;
  recentlyUsed: string[];
  activeSimulator: string;
  setCatalog: (catalog: Record<string, BlockMetadata>) => void;
  markRecentlyUsed: (blockType: string) => void;
  setActiveSimulator: (id: string) => void;
}

const RECENT_LIMIT = 12;

export const useLibraryStore = create<LibraryStoreState>((set) => ({
  catalog: {},
  recentlyUsed: [],
  // v1 ships general-simulator as the only target, and the palette opens
  // filtered to what it can actually compile rather than to the whole catalog.
  activeSimulator: "general-simulator",
  setCatalog: (catalog) => {
    set({ catalog });
  },
  markRecentlyUsed: (blockType) => {
    set((state) => ({
      recentlyUsed: [blockType, ...state.recentlyUsed.filter((entry) => entry !== blockType)].slice(
        0,
        RECENT_LIMIT,
      ),
    }));
  },
  setActiveSimulator: (id) => {
    set({ activeSimulator: id });
  },
}));
