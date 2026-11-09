/**
 * FE-54: signal-flow palette panel tests
 *
 * Acceptance:
 * - Library browser renders Signal flow group with expected sub-groups.
 * - Fuzzy search for 'sat' returns signal-flow.discontinuity.saturation among the top results.
 * - Dragging signal-flow.math.gain creates a block with ports [in, out] and param k.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DND_BLOCK_TYPE, decodeBlockPayload } from "../canvas/dnd";
import type { BlockMetadata } from "../model/types";
import { SidebarItem } from "./SidebarItem";
import { getCatalogEntry } from "./catalog-core";
import catalogManifest from "./engine-catalog.json";
import { createBlockFromMetadata } from "./insert";

let SignalFlowPalette: React.ComponentType | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./signal_flow_palette");
  SignalFlowPalette = mod.SignalFlowPalette ?? mod.default;
  if (SignalFlowPalette) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void | Promise<void>) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

afterEach(cleanup);

const EXPECTED_SUBGROUPS = [
  "Sources",
  "Math",
  "Continuous",
  "Discrete",
  "Discontinuity",
  "Logic",
  "Lookup",
  "Sinks",
] as const;

describe("FE-54: signal_flow_palette", () => {
  skip("test_signal_flow_palette_render: the library browser renders the `Signal flow` group with the expected sub-groups", () => {
    if (!SignalFlowPalette) throw new Error("SignalFlowPalette not available");
    render(React.createElement(SignalFlowPalette));

    expect(screen.getByText(/signal.?flow/i)).toBeTruthy();
    for (const group of EXPECTED_SUBGROUPS) {
      expect(screen.getByRole("heading", { name: new RegExp(`^${group}$`, "i") })).toBeTruthy();
    }
  });

  skip("test_signal_flow_palette_search: typing 'sat' returns signal-flow.discontinuity.saturation among the top results", async () => {
    if (!SignalFlowPalette) throw new Error("SignalFlowPalette not available");
    render(React.createElement(SignalFlowPalette));

    const search = screen.getByRole("searchbox", { name: /search signal flow blocks/i });
    fireEvent.change(search, { target: { value: "sat" } });

    await waitFor(() => {
      const labels = Array.from(document.querySelectorAll(".library-item__label"))
        .map((node) => node.textContent?.trim().toLowerCase() ?? "")
        .filter(Boolean);

      const saturationIndex = labels.findIndex((label) => label === "saturation");
      expect(saturationIndex).toBeGreaterThanOrEqual(0);
      expect(saturationIndex).toBeLessThan(3);
    });
  });

  skip("test_signal_flow_palette_drag: dragging signal-flow.math.gain creates a block with ports [in, out] and param k", () => {
    const manifestEntry = (
      catalogManifest as Array<{ metadata: BlockMetadata & { type?: string } }>
    ).find((entry) => entry.metadata.type === "signal-flow.math.gain");

    expect(manifestEntry).toBeTruthy();
    if (!manifestEntry) throw new Error("Missing signal-flow.math.gain in catalog manifest");
    const gainMetadata = manifestEntry.metadata;

    const onInsert = vi.fn();
    render(React.createElement(SidebarItem, { entry: gainMetadata, onInsert }));
    const button = screen.getByRole("button");

    const setData = vi.fn();
    const dt = { setData, setDragImage: vi.fn(), effectAllowed: "" } as unknown as DataTransfer;
    fireEvent.dragStart(button, { dataTransfer: dt });

    const payloadCall = setData.mock.calls.find((call) => call[0] === DND_BLOCK_TYPE);
    expect(payloadCall).toBeTruthy();
    if (!payloadCall) throw new Error("Missing DND_BLOCK_TYPE payload in dragStart");
    const payload = decodeBlockPayload(payloadCall[1]);
    expect(payload?.blockName).toBe(gainMetadata.name);

    const gainCatalogEntry = getCatalogEntry("signal-flow.math.gain", "n_a");
    expect(gainCatalogEntry).not.toBeNull();
    if (!gainCatalogEntry) throw new Error("Missing catalog entry for signal-flow.math.gain");
    expect(gainCatalogEntry.ports.map((port) => port.id)).toEqual(["in", "out"]);
    expect(gainCatalogEntry.params.map((param) => param.id)).toContain("k");

    const block = createBlockFromMetadata(gainMetadata, [100, 100]);
    expect(block.params).toHaveProperty("k");
  });
});
