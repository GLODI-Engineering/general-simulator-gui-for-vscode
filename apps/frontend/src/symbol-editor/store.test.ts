import { beforeEach, describe, expect, it } from "vitest";
import { useSymbolEditorStore } from "./store";

describe("FE-173: useSymbolEditorStore", () => {
  beforeEach(() => {
    useSymbolEditorStore.getState().reset();
  });

  it("defaults to the select tool and an empty draft", () => {
    const state = useSymbolEditorStore.getState();
    expect(state.tool).toBe("select");
    expect(state.primitives).toEqual([]);
    expect(state.ports).toEqual([]);
  });

  it("setTool switches the active tool", () => {
    useSymbolEditorStore.getState().setTool("circle");
    expect(useSymbolEditorStore.getState().tool).toBe("circle");
  });

  it("addPrimitive appends and auto-selects the new shape", () => {
    const store = useSymbolEditorStore.getState();
    store.addPrimitive({ type: "rect", x: 0, y: 0, w: 10, h: 10 });
    store.addPrimitive({ type: "circle", cx: 5, cy: 5, r: 2 });
    const state = useSymbolEditorStore.getState();
    expect(state.primitives).toHaveLength(2);
    expect(state.selectedIndex).toBe(1);
  });

  it("removeSelected removes the selected primitive and clears selection", () => {
    const store = useSymbolEditorStore.getState();
    store.addPrimitive({ type: "rect", x: 0, y: 0, w: 10, h: 10 });
    store.removeSelected();
    const state = useSymbolEditorStore.getState();
    expect(state.primitives).toEqual([]);
    expect(state.selectedIndex).toBeNull();
  });

  it("addPort assigns a stable unique key distinct from the editable id", () => {
    const store = useSymbolEditorStore.getState();
    store.addPort({
      id: "p1",
      label: "P1",
      side: "left",
      offset: 10,
      kind: "physical-electrical",
      direction: "input",
    });
    store.addPort({
      id: "p1",
      label: "P1 dup",
      side: "right",
      offset: 10,
      kind: "physical-electrical",
      direction: "output",
    });
    const ports = useSymbolEditorStore.getState().ports;
    expect(ports).toHaveLength(2);
    expect(ports[0].key).not.toBe(ports[1].key);
  });

  it("updatePort patches only the targeted port", () => {
    const store = useSymbolEditorStore.getState();
    store.addPort({
      id: "p1",
      label: "P1",
      side: "left",
      offset: 10,
      kind: "physical-electrical",
      direction: "input",
    });
    const key = useSymbolEditorStore.getState().ports[0].key;
    store.updatePort(key, { offset: 25 });
    expect(useSymbolEditorStore.getState().ports[0].offset).toBe(25);
  });

  it("removePort removes only the targeted port", () => {
    const store = useSymbolEditorStore.getState();
    store.addPort({
      id: "p1",
      label: "P1",
      side: "left",
      offset: 10,
      kind: "physical-electrical",
      direction: "input",
    });
    store.addPort({
      id: "p2",
      label: "P2",
      side: "right",
      offset: 10,
      kind: "physical-electrical",
      direction: "output",
    });
    const [first] = useSymbolEditorStore.getState().ports;
    store.removePort(first.key);
    const remaining = useSymbolEditorStore.getState().ports;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("p2");
  });

  it("copySelected snapshots the selected primitive into the clipboard", () => {
    const store = useSymbolEditorStore.getState();
    store.addPrimitive({ type: "rect", x: 0, y: 0, w: 10, h: 10 });
    store.copySelected();
    expect(useSymbolEditorStore.getState().clipboard).toEqual({
      type: "rect",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    });
  });

  it("copySelected does nothing when nothing is selected", () => {
    useSymbolEditorStore.getState().copySelected();
    expect(useSymbolEditorStore.getState().clipboard).toBeNull();
  });

  it("pasteClipboard adds an offset copy and selects it, leaving the original untouched", () => {
    const store = useSymbolEditorStore.getState();
    store.addPrimitive({ type: "rect", x: 0, y: 0, w: 10, h: 10 });
    store.copySelected();
    store.pasteClipboard();

    const state = useSymbolEditorStore.getState();
    expect(state.primitives).toHaveLength(2);
    expect(state.primitives[0]).toEqual({ type: "rect", x: 0, y: 0, w: 10, h: 10 });
    expect(state.primitives[1]).toEqual({ type: "rect", x: 4, y: 4, w: 10, h: 10 });
    expect(state.selectedIndex).toBe(1);
  });

  it("pasting repeatedly cascades further out instead of stacking on the same spot", () => {
    const store = useSymbolEditorStore.getState();
    store.addPrimitive({ type: "circle", cx: 5, cy: 5, r: 2 });
    store.copySelected();
    store.pasteClipboard();
    store.pasteClipboard();

    const state = useSymbolEditorStore.getState();
    expect(state.primitives).toEqual([
      { type: "circle", cx: 5, cy: 5, r: 2 },
      { type: "circle", cx: 9, cy: 9, r: 2 },
      { type: "circle", cx: 13, cy: 13, r: 2 },
    ]);
  });

  it("editing a pasted primitive does not retroactively change the clipboard snapshot", () => {
    const store = useSymbolEditorStore.getState();
    store.addPrimitive({ type: "circle", cx: 5, cy: 5, r: 2 });
    store.copySelected();
    store.pasteClipboard();
    const clipboardAfterPaste = useSymbolEditorStore.getState().clipboard;
    store.updatePrimitive(1, { type: "circle", cx: 99, cy: 99, r: 2 });

    expect(useSymbolEditorStore.getState().clipboard).toEqual(clipboardAfterPaste);
  });

  it("pasteClipboard does nothing when the clipboard is empty", () => {
    useSymbolEditorStore.getState().pasteClipboard();
    expect(useSymbolEditorStore.getState().primitives).toEqual([]);
  });

  it("selectPort selects a port and clears any primitive selection", () => {
    const store = useSymbolEditorStore.getState();
    store.addPrimitive({ type: "rect", x: 0, y: 0, w: 10, h: 10 });
    store.addPort({
      id: "p1",
      label: "P1",
      side: "left",
      offset: 10,
      kind: "physical-electrical",
      direction: "input",
    });
    const key = useSymbolEditorStore.getState().ports[0].key;
    store.selectPort(key);

    const state = useSymbolEditorStore.getState();
    expect(state.selectedPortKey).toBe(key);
    expect(state.selectedIndex).toBeNull();
  });

  it("selecting a primitive clears any port selection", () => {
    const store = useSymbolEditorStore.getState();
    store.addPrimitive({ type: "rect", x: 0, y: 0, w: 10, h: 10 });
    store.addPort({
      id: "p1",
      label: "P1",
      side: "left",
      offset: 10,
      kind: "physical-electrical",
      direction: "input",
    });
    const key = useSymbolEditorStore.getState().ports[0].key;
    store.selectPort(key);
    store.select(0);

    const state = useSymbolEditorStore.getState();
    expect(state.selectedIndex).toBe(0);
    expect(state.selectedPortKey).toBeNull();
  });

  it("removeSelected removes the selected port when a port (not a primitive) is selected", () => {
    const store = useSymbolEditorStore.getState();
    store.addPort({
      id: "p1",
      label: "P1",
      side: "left",
      offset: 10,
      kind: "physical-electrical",
      direction: "input",
    });
    const key = useSymbolEditorStore.getState().ports[0].key;
    store.selectPort(key);
    store.removeSelected();

    const state = useSymbolEditorStore.getState();
    expect(state.ports).toEqual([]);
    expect(state.selectedPortKey).toBeNull();
  });

  it("removePort clears the selection if the removed port was selected", () => {
    const store = useSymbolEditorStore.getState();
    store.addPort({
      id: "p1",
      label: "P1",
      side: "left",
      offset: 10,
      kind: "physical-electrical",
      direction: "input",
    });
    const key = useSymbolEditorStore.getState().ports[0].key;
    store.selectPort(key);
    store.removePort(key);

    expect(useSymbolEditorStore.getState().selectedPortKey).toBeNull();
  });

  it("reset clears the draft back to its initial values, including the clipboard", () => {
    const store = useSymbolEditorStore.getState();
    store.setName("user.widget");
    store.addPrimitive({ type: "rect", x: 0, y: 0, w: 10, h: 10 });
    store.copySelected();
    store.addPort({
      id: "p1",
      label: "P1",
      side: "left",
      offset: 10,
      kind: "physical-electrical",
      direction: "input",
    });
    store.reset();
    const state = useSymbolEditorStore.getState();
    expect(state.name).toBe("");
    expect(state.primitives).toEqual([]);
    expect(state.ports).toEqual([]);
    expect(state.tool).toBe("select");
    expect(state.clipboard).toBeNull();
  });
});
