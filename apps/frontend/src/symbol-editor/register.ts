import { registerEditorTab } from "../shell/EditorTabRegistry";
import { SymbolEditorTab } from "./SymbolEditorTab";
import { SymbolEditorToolbar } from "./SymbolEditorToolbar";

export function registerSymbolEditorTab(): void {
  registerEditorTab({
    id: "core.symbol-editor",
    label: "Symbol Editor",
    order: 20,
    component: SymbolEditorTab,
    toolbar: SymbolEditorToolbar,
  });
}

export default registerSymbolEditorTab;
