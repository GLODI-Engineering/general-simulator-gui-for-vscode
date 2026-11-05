import { create } from "zustand";
import { DEFAULT_SIM_SETTINGS, type SimSettings } from "../simulation/SimSettings";

interface SimSettingsState {
  settings: SimSettings;
  updateSettings: (patch: Partial<SimSettings>) => void;
  setSettings: (patch: Partial<SimSettings>) => void;
}

export const useSimSettingsStore = create<SimSettingsState>((set) => ({
  settings: DEFAULT_SIM_SETTINGS,
  updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  setSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
}));
