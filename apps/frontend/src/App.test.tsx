import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("uplot", () => ({
  default: class UPlot {
    destroy() {}
  },
}));

// FE-83: isolate the App window-hook test from child-surface async updates
vi.mock("./shell/MainToolbar", () => ({ MainToolbar: () => null }));
vi.mock("./shell/BottomPanel", () => ({ BottomPanel: () => null }));
vi.mock("./shell/ShellDialogs", () => ({ ShellDialogs: () => null }));
vi.mock("./inspector/Inspector", () => ({ Inspector: () => null }));
vi.mock("./shell/ToastHost", () => ({ ToastHost: () => null }));
vi.mock("./ipc/transport", () => ({
  getIpcClient: () => ({
    subscribe: () => () => {},
  }),
}));

import App from "./App";
import type { BlockMetadata } from "./model/types";
import { useGraphStore, useLibraryStore, useUiStore } from "./store";

const ELECTRICAL_BLOCK: BlockMetadata = {
  name: "source.voltage.dc",
  label: "V (DC)",
  version: 1,
  category: "sources",
  description: "Ideal DC voltage source.",
  ports: {
    inputs: [{ id: "p", label: "+", kind: { domain: "electrical" }, side: "left", offset: 20 }],
    outputs: [{ id: "n", label: "-", kind: { domain: "electrical" }, side: "right", offset: 20 }],
  },
  params: [{ name: "V", label: "Voltage", type: "number", default: 0 }],
  symbol: { bbox: [60, 40], shape: "circle", text: "V (DC)" },
  behavior: {
    causality: "source",
    domain: "electrical",
    state_count: 0,
    equation_template: "source.voltage.dc",
  },
};

describe("App window hooks", () => {
  beforeEach(() => {
    useGraphStore.getState().loadDocument({
      schema_version: 1,
      model: {
        id: "model-1",
        name: "Untitled model",
        grid: 10,
        blocks: [],
        wires: [],
        metadata: {},
      },
    });
    useLibraryStore.setState({
      catalog: {
        "source.voltage.dc": ELECTRICAL_BLOCK,
        "passive.resistor": {
          ...ELECTRICAL_BLOCK,
          name: "passive.resistor",
          label: "Resistor",
          category: "passive",
          params: [{ name: "R", label: "Resistance", type: "number", default: 1000 }],
          symbol: { bbox: [60, 40], shape: "rect", text: "R" },
          behavior: {
            ...ELECTRICAL_BLOCK.behavior,
            causality: "acausal",
            equation_template: "passive.resistor",
          },
        },
      },
      recentlyUsed: [],
      activeSimulator: "all",
    });
    useUiStore.setState({ pan: { x: 0, y: 0 }, zoom: 1 });
  });

  afterEach(() => {
    cleanup();
  });

  it("exposes simulator and electrical wiring hooks on window", async () => {
    const { unmount } = render(<App />);
    const win = window as typeof window & {
      __gensim_insertBlock?: (type: string) => void;
      __gensim_wire_electrical?: (
        fromType: string,
        fromPort: string,
        toType: string,
        toPort: string,
      ) => void;
      __gensim_setActiveSimulator?: (id: string) => void;
    };

    await waitFor(() => {
      expect(typeof win.__gensim_wire_electrical).toBe("function");
      expect(typeof win.__gensim_setActiveSimulator).toBe("function");
    });

    await act(async () => {
      win.__gensim_insertBlock?.("source.voltage.dc");
      win.__gensim_insertBlock?.("passive.resistor");
      win.__gensim_wire_electrical?.("source.voltage.dc", "p", "passive.resistor", "p");
      win.__gensim_setActiveSimulator?.("xyce");
    });

    const state = useGraphStore.getState();
    expect(state.document.model.wires).toHaveLength(1);
    expect(state.document.model.wires[0]?.from.port).toBe("p");
    expect(state.document.model.wires[0]?.to.port).toBe("p");
    expect(useLibraryStore.getState().activeSimulator).toBe("xyce");

    unmount();
    expect(win.__gensim_wire_electrical).toBeUndefined();
    expect(win.__gensim_setActiveSimulator).toBeUndefined();
  });
});
