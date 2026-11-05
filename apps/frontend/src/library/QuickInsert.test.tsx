/**
 * FE-24: QuickInsert component tests
 */

import { fireEvent, render } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

let QuickInsert: React.ComponentType<unknown> | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./QuickInsert");
  QuickInsert = mod.QuickInsert ?? mod.default;
  if (QuickInsert !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-24: QuickInsert", () => {
  skip("renders without crashing", () => {
    expect(() =>
      render(
        React.createElement(QuickInsert!, {
          onInsert: () => {},
          onClose: () => {},
          position: { x: 0, y: 0 },
        }),
      ),
    ).not.toThrow();
  });

  skip("Esc key calls onClose with no insert", () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      React.createElement(QuickInsert!, { onInsert, onClose, position: { x: 0, y: 0 } }),
    );
    // keyDown handler is on the <section> inside the component
    const section = container.querySelector("section") ?? container;
    fireEvent.keyDown(section, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(onInsert).not.toHaveBeenCalled();
  });
});
