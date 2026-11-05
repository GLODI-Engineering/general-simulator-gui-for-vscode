import { registerBottomTab } from "../shell/registries/BottomTabRegistry";
import { WorkspaceTab } from "./WorkspaceTab";

let registered = false;

export function registerWorkspaceTab(): void {
  if (registered) {
    return;
  }
  registerBottomTab({
    id: "core.workspace",
    label: "Workspace",
    component: WorkspaceTab,
    order: 20,
  });
  registered = true;
}

export default registerWorkspaceTab;
