import { registerActivity } from "../shell/registries/ActivityRegistry";
import { LibraryActivity } from "./LibraryActivity";

let registered = false;

export function registerLibraryActivity(): void {
  if (registered) {
    return;
  }

  registerActivity({
    id: "core.library",
    label: "Library",
    icon: "⊞",
    component: LibraryActivity,
    order: 30,
  });

  registered = true;
}
