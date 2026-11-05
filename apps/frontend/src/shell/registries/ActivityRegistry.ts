import type { ComponentType, ReactNode } from "react";

export interface ActivityRegistration {
  id: "core.explorer" | "core.search" | "core.library" | "core.problems";
  icon: ReactNode;
  label: string;
  component: ComponentType;
  order: number;
}

const activities = new Map<ActivityRegistration["id"], ActivityRegistration>();

export function resetActivityRegistry(): void {
  activities.clear();
}

export function registerActivity(activity: ActivityRegistration): void {
  if (activities.has(activity.id)) {
    throw new Error(`Duplicate activity id: ${activity.id}`);
  }
  activities.set(activity.id, activity);
}

export function listActivities(): ActivityRegistration[] {
  return [...activities.values()].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}
