import { registerEditorTab } from "../shell/EditorTabRegistry";
import { NetlistTab } from "./NetlistTab";

export function registerNetlistTab(): void {
  registerEditorTab({ id: "core.netlist", label: "Netlist", order: 15, component: NetlistTab });
}

export default registerNetlistTab;
