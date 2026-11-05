import type { ComponentType, ReactNode } from "react";

export interface BottomTabRegistration {
  id: "core.waveform" | "core.workspace" | "core.output" | "core.problems";
  label: string;
  icon?: ReactNode;
  component: ComponentType;
  order: number;
  badge?: () => string | number | null;
}

const tabs = new Map<BottomTabRegistration["id"], BottomTabRegistration>();

export function resetBottomTabRegistry(): void {
  tabs.clear();
}

export function registerBottomTab(tab: BottomTabRegistration): void {
  if (tabs.has(tab.id)) {
    throw new Error(`Duplicate bottom tab id: ${tab.id}`);
  }
  tabs.set(tab.id, tab);
}

export function listBottomTabs(): BottomTabRegistration[] {
  return [...tabs.values()].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}
