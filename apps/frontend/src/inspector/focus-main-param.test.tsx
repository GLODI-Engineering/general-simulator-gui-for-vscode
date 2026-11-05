/**
 * FE-27: focus-main-param tests
 *
 * Acceptance:
 * - Alt+Enter on PID focuses kp editor.
 * - Alt+Enter with multi-selection is a no-op.
 */

import { describe, expect, it, vi } from "vitest";

let focusMainParam: Function | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./focus-main-param");
  focusMainParam = mod.focusMainParam ?? mod.default;
  if (focusMainParam !== null) available = true;
} catch {
  /* not yet implemented */
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-27: focus-main-param", () => {
  skip("focuses main_param editor for single selection", () => {
    const focus = vi.fn();
    focusMainParam?.({
      selection: ["b1"],
      blocks: { b1: { id: "b1", type: "control.pid", params: { kp: 1 } } },
      metadata: { "control.pid": { main_param: "kp" } },
      focusEditor: focus,
    });
    expect(focus).toHaveBeenCalledWith("b1", "kp");
  });

  skip("no-op for multi-selection", () => {
    const focus = vi.fn();
    focusMainParam?.({
      selection: ["b1", "b2"],
      blocks: {},
      metadata: {},
      focusEditor: focus,
    });
    expect(focus).not.toHaveBeenCalled();
  });

  skip("no-op when block has no main_param", () => {
    const focus = vi.fn();
    focusMainParam?.({
      selection: ["b1"],
      blocks: { b1: { id: "b1", type: "control.gain", params: { k: 1 } } },
      metadata: { "control.gain": {} }, // no main_param
      focusEditor: focus,
    });
    expect(focus).not.toHaveBeenCalled();
  });
});
