import { registerActivity } from "../shell/registries/ActivityRegistry";
import { SearchActivity } from "./SearchActivity";

let registered = false;

export function registerSearchActivity(): void {
  if (registered) {
    return;
  }

  registerActivity({
    id: "core.search",
    label: "Search",
    icon: "⌕",
    component: SearchActivity,
    order: 20,
  });

  registered = true;
}

export default registerSearchActivity;
