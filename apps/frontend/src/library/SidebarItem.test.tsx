/**
 * FE-42: SidebarItem tests
 *
 * Acceptance:
 * - SidebarItem renders with draggable=true and sets the correct
 *   application/x-gensim-block payload on dragstart.
 * - Click-to-insert calls onInsert.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DND_BLOCK_TYPE } from "../canvas/dnd";

let SidebarItem: React.ComponentType<{
  entry: { name: string; label: string; description: string };
  onInsert: (entry: unknown) => void;
}> | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./SidebarItem");
  SidebarItem = mod.SidebarItem ?? mod.default;
  if (SidebarItem !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

afterEach(cleanup);

const ENTRY = {
  name: "passive.resistor",
  label: "Resistor",
  description: "Linear resistor.",
};

describe("FE-42: SidebarItem", () => {
  skip("renders with draggable=true", () => {
    const onInsert = vi.fn();
    render(React.createElement(SidebarItem!, { entry: ENTRY as never, onInsert }));
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("draggable")).toBe("true");
  });

  skip("sets application/x-gensim-block payload on dragstart", () => {
    const onInsert = vi.fn();
    render(React.createElement(SidebarItem!, { entry: ENTRY as never, onInsert }));
    const btn = screen.getByRole("button");

    const setData = vi.fn();
    const dt = { setData, setDragImage: vi.fn(), effectAllowed: "" } as unknown as DataTransfer;
    fireEvent.dragStart(btn, { dataTransfer: dt });

    expect(setData).toHaveBeenCalledWith(DND_BLOCK_TYPE, expect.stringContaining(ENTRY.name));
  });

  skip("click calls onInsert with the entry", () => {
    const onInsert = vi.fn();
    render(React.createElement(SidebarItem!, { entry: ENTRY as never, onInsert }));
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ name: ENTRY.name }));
  });

  skip("shows label text", () => {
    const onInsert = vi.fn();
    render(React.createElement(SidebarItem!, { entry: ENTRY as never, onInsert }));
    const button = screen.getByRole("button");
    expect(within(button).getByText("Resistor")).toBeTruthy();
  });
});
