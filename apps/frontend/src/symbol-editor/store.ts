import { create } from "zustand";

import type { Primitive } from "../canvas/nodes/primitive-renderer";
import type { PortKindDomain } from "../model/types";
import { translatePrimitive } from "./primitive-ops";

// FE-173: Symbol Editor draft state. A dedicated store (not local component
// state) because EditorArea.tsx unmounts the inactive tab's component on
// every tab switch — losing an in-progress drawing every time the user
// glanced at the Schematic tab would make this unusable.

export type SymbolTool = "select" | "line" | "rect" | "circle" | "text" | "port";

export type PortSide = "left" | "right" | "top" | "bottom";

export interface SymbolPortDraft {
  key: number;
  id: string;
  label: string;
  side: PortSide;
  offset: number;
  kind: PortKindDomain;
  direction: "input" | "output";
}

export const SYMBOL_CATEGORIES = [
  "signal",
  "control",
  "power",
  "passive",
  "sources",
  "dependent",
  "semiconductor",
  "tline",
  "sinks",
  "subsystems",
  "user",
] as const;

export const SYMBOL_PARADIGMS = [
  "physical-network",
  "signal-flow",
  "converter",
  "hierarchy",
  "routing",
  "annotation",
] as const;

export const SYMBOL_PORT_DOMAINS: PortKindDomain[] = [
  "signal",
  "signal-bus",
  "function-call",
  "physical-electrical",
  "physical-translational",
  "physical-rotational",
  "physical-thermal",
  "physical-signal",
  "mixed",
];

export const SYMBOL_BEHAVIOR_DOMAINS = [
  "signal",
  "electrical",
  "thermal",
  "mechanical",
  "event",
  "mixed",
] as const;

let nextPortKey = 0;
export function newPortKey(): number {
  nextPortKey += 1;
  return nextPortKey;
}

export interface SymbolEditorState {
  tool: SymbolTool;
  bboxW: number;
  bboxH: number;
  primitives: Primitive[];
  selectedIndex: number | null;
  selectedPortKey: number | null;
  clipboard: Primitive | null;
  ports: SymbolPortDraft[];

  name: string;
  label: string;
  category: (typeof SYMBOL_CATEGORIES)[number];
  paradigm: (typeof SYMBOL_PARADIGMS)[number];
  domain: PortKindDomain;
  behaviorDomain: (typeof SYMBOL_BEHAVIOR_DOMAINS)[number];
  description: string;

  setTool: (tool: SymbolTool) => void;
  setBBox: (w: number, h: number) => void;
  addPrimitive: (primitive: Primitive) => void;
  updatePrimitive: (index: number, primitive: Primitive) => void;
  removePrimitive: (index: number) => void;
  select: (index: number | null) => void;
  removeSelected: () => void;
  copySelected: () => void;
  pasteClipboard: () => void;
  addPort: (port: Omit<SymbolPortDraft, "key">) => void;
  updatePort: (key: number, patch: Partial<SymbolPortDraft>) => void;
  removePort: (key: number) => void;
  selectPort: (key: number | null) => void;
  setName: (value: string) => void;
  setLabel: (value: string) => void;
  setCategory: (value: (typeof SYMBOL_CATEGORIES)[number]) => void;
  setParadigm: (value: (typeof SYMBOL_PARADIGMS)[number]) => void;
  setDomain: (value: PortKindDomain) => void;
  setBehaviorDomain: (value: (typeof SYMBOL_BEHAVIOR_DOMAINS)[number]) => void;
  setDescription: (value: string) => void;
  reset: () => void;
}

const initialDraft = {
  tool: "select" as SymbolTool,
  bboxW: 60,
  bboxH: 40,
  primitives: [] as Primitive[],
  selectedIndex: null as number | null,
  selectedPortKey: null as number | null,
  clipboard: null as Primitive | null,
  ports: [] as SymbolPortDraft[],
  name: "",
  label: "",
  category: "user" as const,
  paradigm: "physical-network" as const,
  domain: "physical-electrical" as PortKindDomain,
  behaviorDomain: "electrical" as const,
  description: "",
};

export const useSymbolEditorStore = create<SymbolEditorState>((set) => ({
  ...initialDraft,

  setTool: (tool) => set({ tool }),
  setBBox: (w, h) => set({ bboxW: Math.max(1, w), bboxH: Math.max(1, h) }),
  addPrimitive: (primitive) =>
    set((state) => ({
      primitives: [...state.primitives, primitive],
      selectedIndex: state.primitives.length,
      selectedPortKey: null,
    })),
  updatePrimitive: (index, primitive) =>
    set((state) => ({
      primitives: state.primitives.map((p, i) => (i === index ? primitive : p)),
    })),
  removePrimitive: (index) =>
    set((state) => ({
      primitives: state.primitives.filter((_, i) => i !== index),
      selectedIndex: state.selectedIndex === index ? null : state.selectedIndex,
    })),
  select: (index) => set({ selectedIndex: index, selectedPortKey: null }),
  removeSelected: () =>
    set((state) => {
      if (state.selectedPortKey !== null) {
        return {
          ports: state.ports.filter((port) => port.key !== state.selectedPortKey),
          selectedPortKey: null,
        };
      }
      if (state.selectedIndex === null) return state;
      return {
        primitives: state.primitives.filter((_, i) => i !== state.selectedIndex),
        selectedIndex: null,
      };
    }),
  copySelected: () =>
    set((state) => {
      if (state.selectedIndex === null) return state;
      const source = state.primitives[state.selectedIndex];
      // Structural clone, not a reference — pasting-then-editing the
      // clipboard's own primitive later must not retroactively change
      // what a prior paste already placed.
      return { clipboard: JSON.parse(JSON.stringify(source)) as Primitive };
    }),
  pasteClipboard: () =>
    set((state) => {
      if (!state.clipboard) return state;
      // Offset so the pasted copy is visibly distinct from the original
      // instead of landing exactly on top of it. Cascades: pasting
      // repeatedly steps each new copy further out (clipboard advances to
      // the just-pasted primitive), rather than stacking every paste on
      // the exact same spot.
      const pasted = translatePrimitive(state.clipboard, 4, 4);
      return {
        primitives: [...state.primitives, pasted],
        selectedIndex: state.primitives.length,
        clipboard: pasted,
      };
    }),
  addPort: (port) =>
    set((state) => ({
      ports: [...state.ports, { ...port, key: newPortKey() }],
      selectedIndex: null,
    })),
  updatePort: (key, patch) =>
    set((state) => ({
      ports: state.ports.map((port) => (port.key === key ? { ...port, ...patch } : port)),
    })),
  removePort: (key) =>
    set((state) => ({
      ports: state.ports.filter((port) => port.key !== key),
      selectedPortKey: state.selectedPortKey === key ? null : state.selectedPortKey,
    })),
  selectPort: (key) => set({ selectedPortKey: key, selectedIndex: null }),
  setName: (name) => set({ name }),
  setLabel: (label) => set({ label }),
  setCategory: (category) => set({ category }),
  setParadigm: (paradigm) => set({ paradigm }),
  setDomain: (domain) => set({ domain }),
  setBehaviorDomain: (behaviorDomain) => set({ behaviorDomain }),
  setDescription: (description) => set({ description }),
  reset: () => set({ ...initialDraft, primitives: [], ports: [] }),
}));
