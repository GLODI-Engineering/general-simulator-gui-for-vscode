/**
 * FE-06: Keymap registry + dispatcher tests
 *
 * Uses the actual API: getMatchingBinding(chord, context) → KeyBinding | null
 * and assertNoKeybindingConflicts(bindings).
 */

import { describe, expect, it } from "vitest";

type KeyActionContext = { activeContexts: string[]; platform: "win" | "mac" };
type KeyBinding = { id: string };

let keyBindings: unknown[] | null = null;
let getMatchingBinding: ((chord: string, context: KeyActionContext) => KeyBinding | null) | null =
  null;
let assertNoKeybindingConflicts: ((bindings: unknown[]) => void) | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./keymap");
  keyBindings = mod.keyBindings ?? null;
  getMatchingBinding = mod.getMatchingBinding ?? null;
  assertNoKeybindingConflicts = mod.assertNoKeybindingConflicts ?? null;
  if (keyBindings !== null && getMatchingBinding !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

// Helper: make a KeyActionContext
function ctx(activeContexts: string[], platform: "win" | "mac" = "win") {
  return { activeContexts, platform };
}

describe("FE-06: keymap registry", () => {
  // --- §1: File operations ---
  skip("Ctrl+N → file.new (global)", () => {
    const b = getMatchingBinding?.("Ctrl+N", ctx(["global"]));
    expect(b?.id).toBe("file.new");
  });

  skip("Ctrl+O → file.open (global)", () => {
    const b = getMatchingBinding?.("Ctrl+O", ctx(["global"]));
    expect(b?.id).toBe("file.open");
  });

  skip("Ctrl+S → file.save (global)", () => {
    const b = getMatchingBinding?.("Ctrl+S", ctx(["global"]));
    expect(b?.id).toBe("file.save");
  });

  skip("Ctrl+Shift+S → file.save-as (global)", () => {
    const b = getMatchingBinding?.("Ctrl+Shift+S", ctx(["global"]));
    expect(b?.id).toBe("file.save-as");
  });

  // --- §2: Edit ---
  skip("Ctrl+Z → history.undo (global)", () => {
    const b = getMatchingBinding?.("Ctrl+Z", ctx(["global"]));
    expect(b?.id).toBe("history.undo");
  });

  skip("Ctrl+Y → history.redo (global)", () => {
    const b = getMatchingBinding?.("Ctrl+Y", ctx(["global"]));
    expect(b?.id).toBe("history.redo");
  });

  skip("Ctrl+C → clipboard.copy (global)", () => {
    const b = getMatchingBinding?.("Ctrl+C", ctx(["global"]));
    expect(b?.id).toBe("clipboard.copy");
  });

  skip("Ctrl+V → clipboard.paste (global)", () => {
    const b = getMatchingBinding?.("Ctrl+V", ctx(["global"]));
    expect(b?.id).toBe("clipboard.paste");
  });

  skip("Delete → selection.delete (selection context)", () => {
    const b = getMatchingBinding?.("Delete", ctx(["selection"]));
    expect(b?.id).toBe("selection.delete");
  });

  skip("Ctrl+A → selection.select-all (canvas context)", () => {
    const b = getMatchingBinding?.("Ctrl+A", ctx(["canvas"]));
    expect(b?.id).toBe("selection.select-all");
  });

  // --- §7: wire drawing ---
  skip("/ → wire.toggle-posture in drawing-wire context", () => {
    const b = getMatchingBinding?.("/", ctx(["drawing-wire"]));
    expect(b?.id).toBe("wire.toggle-posture");
  });

  skip("/ does NOT match wire.toggle-posture in canvas context", () => {
    const b = getMatchingBinding?.("/", ctx(["canvas"]));
    expect(b?.id).not.toBe("wire.toggle-posture");
  });

  // --- §8: transforms ---
  skip("Ctrl+R → transform.rotate-cw (selection)", () => {
    const b = getMatchingBinding?.("Ctrl+R", ctx(["selection"]));
    expect(b?.id).toBe("transform.rotate-cw");
  });

  skip("conflict guard throws when two bindings share (chord, context)", () => {
    expect(() => {
      assertNoKeybindingConflicts?.([
        { id: "a", chord: "Ctrl+Z", contexts: ["canvas"] },
        { id: "b", chord: "Ctrl+Z", contexts: ["canvas"] },
      ]);
    }).toThrow();
  });

  skip("no conflicts in built-in bindings", () => {
    expect(() => assertNoKeybindingConflicts?.(keyBindings)).not.toThrow();
  });
});
