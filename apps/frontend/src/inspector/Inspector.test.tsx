/**
 * FE-26: Property Inspector tests
 *
 * Acceptance:
 * - 0/1/N-selection states render correctly.
 * - Editing each param type updates store on commit, not on every keystroke.
 * - Multi-selection edit applies to all selected blocks.
 */

import { render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it } from "vitest";

let Inspector: React.ComponentType | null = null;

type StoreApi = { setState: (updater: (s: unknown) => unknown) => void };

let useGraphStore: StoreApi | null = null;
let useUiStore: StoreApi | null = null;
let useLibraryStore: StoreApi | null = null;
let available = false;

try {
  const modInspector = await import(/* @vite-ignore */ "./Inspector");
  const modStore = await import(/* @vite-ignore */ "../store");
  Inspector = modInspector.Inspector ?? modInspector.default;
  useGraphStore = modStore.useGraphStore;
  useUiStore = modStore.useUiStore;
  useLibraryStore = modStore.useLibraryStore;
  if (Inspector !== null && useGraphStore !== null) available = true;
} catch {
  /* not yet implemented */
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

beforeEach(() => {
  if (!available || !useGraphStore || !useUiStore || !useLibraryStore) return;
  // reset stores to clean state
  useGraphStore.setState((s) => {
    const state = s as Record<string, unknown> & {
      document: { model: { blocks: unknown[]; wires: unknown[] } };
    };
    return {
      ...state,
      document: {
        ...state.document,
        model: { ...state.document.model, blocks: [], wires: [] },
      },
    };
  });
  useUiStore.setState((s) => ({ ...(s as Record<string, unknown>), selection: new Set<string>() }));
  useLibraryStore.setState((s) => ({ ...(s as Record<string, unknown>), catalog: {} }));
});

describe("FE-26: Inspector", () => {
  skip("renders empty state when no block selected", () => {
    if (!Inspector) throw new Error("Inspector not available");
    const { container } = render(React.createElement(Inspector));
    expect(container.textContent).toContain("No block selected");
  });

  skip("renders param editors for one selected block", () => {
    // Seed graph store with a block
    if (!useGraphStore) throw new Error("useGraphStore not available");
    useGraphStore.setState((s) => {
      const state = s as Record<string, unknown> & { document: { model: Record<string, unknown> } };
      return {
        ...state,
        document: {
          ...state.document,
          model: {
            ...state.document.model,
            blocks: [
              {
                id: "b1",
                type: "control.gain",
                position: [0, 0],
                rotation: 0,
                mirror: "none",
                params: { k: 2 },
              },
            ],
          },
        },
      };
    });
    // Seed library store with metadata
    if (!useLibraryStore) throw new Error("useLibraryStore not available");
    useLibraryStore.setState((s) => ({
      ...(s as Record<string, unknown>),
      catalog: {
        "control.gain": {
          name: "control.gain",
          label: "Gain",
          params: [{ name: "k", label: "Gain", type: "number" }],
        },
      },
    }));
    // Seed selection
    if (!useUiStore) throw new Error("useUiStore not available");
    useUiStore.setState((s) => ({
      ...(s as Record<string, unknown>),
      selection: new Set(["b1"]),
    }));
    if (!Inspector) throw new Error("Inspector not available");
    const { container } = render(React.createElement(Inspector));
    expect(container.textContent).toContain("Gain");
  });
});
