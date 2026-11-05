import { beforeEach, describe, expect, it } from "vitest";
import { useLibraryStore } from "../store/library";
import { saveSymbolToLibrary } from "./save";
import { useSymbolEditorStore } from "./store";

function draftWithOneRectAndOnePort() {
  const store = useSymbolEditorStore.getState();
  store.setName("user.my_widget");
  store.setLabel("My Widget");
  store.addPrimitive({ type: "rect", x: 0, y: 0, w: 60, h: 40 });
  store.addPort({
    id: "p1",
    label: "P1",
    side: "left",
    offset: 20,
    kind: "physical-electrical",
    direction: "input",
  });
}

describe("FE-175: saveSymbolToLibrary", () => {
  beforeEach(() => {
    useSymbolEditorStore.getState().reset();
    useLibraryStore.setState({ catalog: {}, recentlyUsed: [], activeSimulator: "all" });
  });

  it("rejects a non-dotted Type ID without touching the catalog", () => {
    const store = useSymbolEditorStore.getState();
    store.setName("NotDotted");
    store.setLabel("X");
    store.addPrimitive({ type: "rect", x: 0, y: 0, w: 10, h: 10 });
    store.addPort({
      id: "p1",
      label: "P1",
      side: "left",
      offset: 5,
      kind: "physical-electrical",
      direction: "input",
    });

    const result = saveSymbolToLibrary();

    expect(result.ok).toBe(false);
    expect(useLibraryStore.getState().catalog).toEqual({});
  });

  it("rejects a symbol with no drawn shapes", () => {
    const store = useSymbolEditorStore.getState();
    store.setName("user.my_widget");
    store.setLabel("My Widget");
    store.addPort({
      id: "p1",
      label: "P1",
      side: "left",
      offset: 5,
      kind: "physical-electrical",
      direction: "input",
    });

    const result = saveSymbolToLibrary();
    expect(result).toEqual({ ok: false, error: "Draw at least one shape before saving." });
  });

  it("rejects a symbol with no ports", () => {
    const store = useSymbolEditorStore.getState();
    store.setName("user.my_widget");
    store.setLabel("My Widget");
    store.addPrimitive({ type: "rect", x: 0, y: 0, w: 10, h: 10 });

    const result = saveSymbolToLibrary();
    expect(result).toEqual({ ok: false, error: "Place at least one port before saving." });
  });

  it("saves a valid draft as a shape:primitives catalog entry", () => {
    draftWithOneRectAndOnePort();

    const result = saveSymbolToLibrary();

    expect(result).toEqual({ ok: true, name: "user.my_widget", persisted: false });
    const entry = useLibraryStore.getState().catalog["user.my_widget"];
    expect(entry).toBeDefined();
    expect(entry.symbol.shape).toBe("primitives");
    expect(entry.symbol.primitives).toEqual([{ type: "rect", x: 0, y: 0, w: 60, h: 40 }]);
    expect(entry.ports.inputs).toEqual([
      { id: "p1", label: "P1", kind: { domain: "physical-electrical" }, side: "left", offset: 20 },
    ]);
  });

  it("merges into an existing catalog without dropping other entries", () => {
    useLibraryStore.getState().setCatalog({
      "control.gain": {
        name: "control.gain",
        label: "Gain",
        version: 1,
        category: "control",
        description: "d",
        paradigm: "signal-flow",
        domain: "signal",
        fidelities: [{ tier: "n_a", ports: [], params: [], doc: "d" }],
        aliases: [],
        tags: [],
        ports: { inputs: [], outputs: [] },
        params: [],
        symbol: { bbox: [20, 10], shape: "rect" },
        behavior: {
          causality: "causal",
          domain: "signal",
          state_count: 0,
          equation_template: "control.gain",
        },
        // biome-ignore lint/suspicious/noExplicitAny: minimal test fixture
      } as any,
    });
    draftWithOneRectAndOnePort();

    saveSymbolToLibrary();

    const catalog = useLibraryStore.getState().catalog;
    expect(catalog["control.gain"]).toBeDefined();
    expect(catalog["user.my_widget"]).toBeDefined();
  });
});
