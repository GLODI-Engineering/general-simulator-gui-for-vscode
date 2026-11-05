import type { ComponentType } from "react";

export interface EditorTabToolbarProps {
  onAction: (actionId: string) => void;
}

export interface EditorTabRegistration {
  id: string;
  label: string;
  order: number;
  component: ComponentType;
  /**
   * Tab-specific toolbar row. shell/ActiveTabToolbar.tsx renders this in
   * the same full-width slot as the always-visible shell/MainToolbar
   * (directly below it, above the sidebars/canvas), swapping content
   * whenever this tab is the active one. Omit for tabs that don't need
   * one (e.g. Netlist, Waveforms) — see canvas/register.ts for the
   * Schematic tab's canvas/SchematicToolbar.tsx.
   */
  toolbar?: ComponentType<EditorTabToolbarProps>;
}

const tabs = new Map<string, EditorTabRegistration>();

export function resetEditorTabRegistry(): void {
  tabs.clear();
}

export function registerEditorTab(tab: EditorTabRegistration): void {
  if (tabs.has(tab.id)) {
    // Idempotent: silently skip duplicates (hot-reload safety)
    return;
  }
  tabs.set(tab.id, tab);
}

export function listEditorTabs(): EditorTabRegistration[] {
  return [...tabs.values()].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}
