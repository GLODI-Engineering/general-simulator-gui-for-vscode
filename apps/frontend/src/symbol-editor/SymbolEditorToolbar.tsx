import type { EditorTabToolbarProps } from "../shell/EditorTabRegistry";
import { Btn, SaveIcon, Sep } from "../shell/ToolbarControls";
import { type SymbolTool, useSymbolEditorStore } from "./store";

// FE-173: the Symbol Editor tab's own toolbar — swapped in by
// shell/ActiveTabToolbar.tsx in place of SchematicToolbar's Insert
// Resistor/MOSFET/etc. buttons whenever this tab is active. Same
// mechanism, not a special case: EditorTabRegistration.toolbar.

const TOOLS: Array<{ id: SymbolTool; label: string; title: string }> = [
  {
    id: "select",
    label: "Select",
    title: "Select tool: click a shape to select it, drag to move.",
  },
  { id: "line", label: "Line", title: "Line tool: click and drag to draw a line." },
  { id: "rect", label: "Rect", title: "Rectangle tool: click and drag to draw a rectangle." },
  {
    id: "circle",
    label: "Circle",
    title: "Circle tool: click at the center and drag out the radius.",
  },
  { id: "text", label: "Text", title: "Text tool: click to place a text label." },
  { id: "port", label: "Port", title: "Port tool: click near an edge to place a port there." },
];

export function SymbolEditorToolbar({ onAction }: EditorTabToolbarProps) {
  const tool = useSymbolEditorStore((s) => s.tool);
  const selectedIndex = useSymbolEditorStore((s) => s.selectedIndex);
  const clipboard = useSymbolEditorStore((s) => s.clipboard);

  return (
    <>
      <Sep />
      <div
        className="editor-workbench symbol-editor-toolbar__tools"
        aria-label="Symbol drawing tools"
      >
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.title}
            aria-pressed={tool === t.id}
            className={tool === t.id ? "is-active" : undefined}
            onClick={() => useSymbolEditorStore.getState().setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Sep />

      <Btn
        title="Copy selected shape  Ctrl+C"
        label="Copy"
        disabled={selectedIndex === null}
        onClick={() => useSymbolEditorStore.getState().copySelected()}
      >
        <CopyIcon />
      </Btn>
      <Btn
        title="Paste  Ctrl+V"
        label="Paste"
        disabled={clipboard === null}
        onClick={() => useSymbolEditorStore.getState().pasteClipboard()}
      >
        <ClipboardIcon />
      </Btn>
      <Btn
        title="Delete selected shape  Del"
        label="Delete"
        disabled={selectedIndex === null}
        onClick={() => useSymbolEditorStore.getState().removeSelected()}
      >
        <TrashIcon />
      </Btn>

      <Sep />

      <Btn
        title="Save this symbol to the library"
        label="Save Symbol"
        onClick={() => onAction("symbol.save")}
      >
        <SaveIcon />
      </Btn>
      <Btn
        title="Discard and return to the Schematic tab"
        label="Cancel"
        onClick={() => onAction("symbol.cancel")}
      >
        <CancelIcon />
      </Btn>
    </>
  );
}

function CopyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

export default SymbolEditorToolbar;
