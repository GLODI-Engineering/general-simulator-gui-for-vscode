import { registerEditorTab } from "../shell/EditorTabRegistry";
import { Canvas } from "./Canvas";
import { SchematicToolbar } from "./SchematicToolbar";

export function registerCanvasTab(): void {
  registerEditorTab({
    id: "core.schematic",
    label: "Schematic",
    order: 0,
    component: Canvas,
    toolbar: SchematicToolbar,
  });
}

export default registerCanvasTab;
