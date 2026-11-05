import { create } from "zustand";
import type { PortKindDomain } from "../model/types";

/**
 * User-customizable wire-color overrides, layered on top of `wire-color.ts`'s own
 * per-domain defaults. Persisted the same way `ui.ts`'s `canvasBackground` is (plain
 * localStorage, best-effort — a private/blocked-storage browser just falls back to the
 * built-in defaults every time, which is a fine degradation for a cosmetic preference).
 */

const STORAGE_KEY = "gensim.ui.wire-colors.v1";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export type WireColorOverrides = Partial<Record<PortKindDomain, string>>;

function loadWireColorOverrides(): WireColorOverrides {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return {};
  }
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const result: WireColorOverrides = {};
    for (const [domain, color] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof color === "string" && HEX_COLOR_RE.test(color)) {
        result[domain as PortKindDomain] = color;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function persistWireColorOverrides(overrides: WireColorOverrides): void {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return;
  }
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore — a blocked/full storage quota is not worth surfacing for a cosmetic setting
  }
}

interface WireColorState {
  overrides: WireColorOverrides;
  setWireColor: (domain: PortKindDomain, color: string) => void;
  resetWireColor: (domain: PortKindDomain) => void;
  resetAllWireColors: () => void;
}

export const useWireColorStore = create<WireColorState>((set) => ({
  overrides: loadWireColorOverrides(),
  setWireColor: (domain, color) => {
    if (!HEX_COLOR_RE.test(color)) return;
    set((state) => {
      const next = { ...state.overrides, [domain]: color };
      persistWireColorOverrides(next);
      return { overrides: next };
    });
  },
  resetWireColor: (domain) => {
    set((state) => {
      const next = { ...state.overrides };
      delete next[domain];
      persistWireColorOverrides(next);
      return { overrides: next };
    });
  },
  resetAllWireColors: () => {
    persistWireColorOverrides({});
    set({ overrides: {} });
  },
}));
