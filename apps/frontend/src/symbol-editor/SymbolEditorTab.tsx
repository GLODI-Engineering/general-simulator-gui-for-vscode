import { useEffect } from "react";

import type { PortKindDomain } from "../model/types";
import { SymbolEditorCanvas } from "./SymbolEditorCanvas";
import {
  type PortSide,
  SYMBOL_BEHAVIOR_DOMAINS,
  SYMBOL_CATEGORIES,
  SYMBOL_PARADIGMS,
  SYMBOL_PORT_DOMAINS,
  useSymbolEditorStore,
} from "./store";

const SIDES: PortSide[] = ["left", "right", "top", "bottom"];

// FE-174/FE-175: the Symbol Editor tab. Canvas on the left (drawing
// surface, FE-174), metadata + ports panel on the right (the "Form step"
// from docs/specs/symbol-editor-spec.md §2.1, now inline instead of the
// separate NewSymbolDialog modal it replaces — one screen instead of a
// dialog-then-nothing workflow). Save/Cancel live in the tab's toolbar
// (SymbolEditorToolbar.tsx), dispatched through App.tsx's handleAction
// like every other action in the app.

export function SymbolEditorTab() {
  const name = useSymbolEditorStore((s) => s.name);
  const label = useSymbolEditorStore((s) => s.label);
  const category = useSymbolEditorStore((s) => s.category);
  const paradigm = useSymbolEditorStore((s) => s.paradigm);
  const domain = useSymbolEditorStore((s) => s.domain);
  const behaviorDomain = useSymbolEditorStore((s) => s.behaviorDomain);
  const description = useSymbolEditorStore((s) => s.description);
  const bboxW = useSymbolEditorStore((s) => s.bboxW);
  const bboxH = useSymbolEditorStore((s) => s.bboxH);
  const ports = useSymbolEditorStore((s) => s.ports);
  const selectedIndex = useSymbolEditorStore((s) => s.selectedIndex);
  const primitiveCount = useSymbolEditorStore((s) => s.primitives.length);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName;
      const inTextField = activeTag === "INPUT" || activeTag === "TEXTAREA";
      if (inTextField) return; // don't fight normal text editing / native copy-paste in fields

      const state = useSymbolEditorStore.getState();
      if ((event.key === "Delete" || event.key === "Backspace") && state.selectedIndex !== null) {
        state.removeSelected();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (state.selectedIndex !== null) {
          event.preventDefault();
          state.copySelected();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        if (state.clipboard) {
          event.preventDefault();
          state.pasteClipboard();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="symbol-editor">
      <SymbolEditorCanvas />
      <div className="symbol-editor__panel">
        <div className="symbol-editor__panel-fields">
          <label>
            Type ID
            <input
              value={name}
              onChange={(e) => useSymbolEditorStore.getState().setName(e.target.value)}
              placeholder="user.my_component"
            />
          </label>
          <label>
            Label
            <input
              value={label}
              onChange={(e) => useSymbolEditorStore.getState().setLabel(e.target.value)}
            />
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(e) =>
                useSymbolEditorStore
                  .getState()
                  .setCategory(e.target.value as (typeof SYMBOL_CATEGORIES)[number])
              }
            >
              {SYMBOL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Paradigm
            <select
              value={paradigm}
              onChange={(e) =>
                useSymbolEditorStore
                  .getState()
                  .setParadigm(e.target.value as (typeof SYMBOL_PARADIGMS)[number])
              }
            >
              {SYMBOL_PARADIGMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Domain
            <select
              value={domain}
              onChange={(e) =>
                useSymbolEditorStore.getState().setDomain(e.target.value as PortKindDomain)
              }
            >
              {SYMBOL_PORT_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Behavior domain
            <select
              value={behaviorDomain}
              onChange={(e) =>
                useSymbolEditorStore
                  .getState()
                  .setBehaviorDomain(e.target.value as (typeof SYMBOL_BEHAVIOR_DOMAINS)[number])
              }
            >
              {SYMBOL_BEHAVIOR_DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Width
            <input
              type="number"
              min={4}
              value={bboxW}
              onChange={(e) =>
                useSymbolEditorStore.getState().setBBox(Number(e.target.value), bboxH)
              }
            />
          </label>
          <label>
            Height
            <input
              type="number"
              min={4}
              value={bboxH}
              onChange={(e) =>
                useSymbolEditorStore.getState().setBBox(bboxW, Number(e.target.value))
              }
            />
          </label>
        </div>
        <label className="symbol-editor__panel-description">
          Description
          <textarea
            value={description}
            onChange={(e) => useSymbolEditorStore.getState().setDescription(e.target.value)}
            rows={2}
          />
        </label>

        <div className="symbol-editor__ports">
          <strong>Ports ({ports.length})</strong>
          <p className="symbol-editor__hint">
            Use the Port tool on the canvas to place one near an edge, or edit the fields below.
          </p>
          {ports.map((port) => (
            <div className="symbol-editor__port-row" key={port.key}>
              <input
                aria-label="Port id"
                value={port.id}
                onChange={(e) =>
                  useSymbolEditorStore.getState().updatePort(port.key, { id: e.target.value })
                }
              />
              <input
                aria-label="Port label"
                value={port.label}
                onChange={(e) =>
                  useSymbolEditorStore.getState().updatePort(port.key, { label: e.target.value })
                }
              />
              <select
                aria-label="Port side"
                value={port.side}
                onChange={(e) =>
                  useSymbolEditorStore
                    .getState()
                    .updatePort(port.key, { side: e.target.value as PortSide })
                }
              >
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                aria-label="Port offset"
                type="number"
                value={port.offset}
                onChange={(e) =>
                  useSymbolEditorStore
                    .getState()
                    .updatePort(port.key, { offset: Number(e.target.value) })
                }
              />
              <select
                aria-label="Port direction"
                value={port.direction}
                onChange={(e) =>
                  useSymbolEditorStore.getState().updatePort(port.key, {
                    direction: e.target.value as "input" | "output",
                  })
                }
              >
                <option value="input">input</option>
                <option value="output">output</option>
              </select>
              <button
                type="button"
                aria-label="Remove port"
                onClick={() => useSymbolEditorStore.getState().removePort(port.key)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <p className="symbol-editor__hint">
          {selectedIndex !== null
            ? "Shape selected — press Delete to remove it, or drag to move it."
            : `${primitiveCount} shape(s) drawn.`}
        </p>
      </div>
    </div>
  );
}

export default SymbolEditorTab;
