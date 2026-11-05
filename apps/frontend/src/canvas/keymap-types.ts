export type KeymapContext =
  | "global"
  | "canvas"
  | "selection"
  | "connected-block"
  | "drawing-wire"
  | "in-place-edit"
  | "modal";

export interface KeyBinding {
  id: string;
  label: string;
  chord: string;
  contexts: KeymapContext[];
}

export interface KeyActionContext {
  activeContexts: KeymapContext[];
  platform: "mac" | "other";
}
