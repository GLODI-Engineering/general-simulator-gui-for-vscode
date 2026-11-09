import { describe, expect, it, vi } from "vitest";

import { chordToKeyboardEvent, replayForwardedChord } from "./forwarded-chord";

describe("a forwarded chord becomes the keystroke it stands for", () => {
  it("reads modifiers and the key", () => {
    // Ctrl+R is the one that prompted this: VS Code's recent-files list was eating it, so
    // rotation never happened.
    expect(chordToKeyboardEvent("Ctrl+R")).toEqual({
      key: "r",
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
    });
    expect(chordToKeyboardEvent("Ctrl+Shift+R")).toMatchObject({
      key: "r",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(chordToKeyboardEvent("F5")).toMatchObject({ key: "F5", ctrlKey: false });
    expect(chordToKeyboardEvent("Ctrl+Shift+Tab")).toMatchObject({
      key: "Tab",
      ctrlKey: true,
      shiftKey: true,
    });
  });

  it("keeps a trailing plus as the key, not a separator", () => {
    // `Ctrl++` is Ctrl and the plus key. Splitting on "+" naively leaves an empty key and
    // dispatches a keystroke with no key at all.
    expect(chordToKeyboardEvent("Ctrl++")).toMatchObject({ key: "+", ctrlKey: true });
    expect(chordToKeyboardEvent("Ctrl+-")).toMatchObject({ key: "-", ctrlKey: true });
  });

  it("spells the keys whose event name differs", () => {
    expect(chordToKeyboardEvent("Ctrl+Alt+Left")).toMatchObject({
      key: "ArrowLeft",
      ctrlKey: true,
      altKey: true,
    });
    expect(chordToKeyboardEvent("Esc")).toMatchObject({ key: "Escape" });
  });

  it("refuses anything that is not a single keystroke", () => {
    // The keymap documents the whole input surface. None of these is one event, and
    // dispatching a guess would fire an arbitrary action.
    for (const chord of [
      "Ctrl+Click",
      "Shift+Drag",
      "Arrow",
      "Ctrl+Shift+Arrow",
      "Ctrl+.,Ctrl+.",
      "",
    ]) {
      expect(chordToKeyboardEvent(chord), chord).toBeNull();
    }
  });

  it("dispatches on window, where the canvas listens", () => {
    const seen: KeyboardEvent[] = [];
    const listener = (event: Event) => seen.push(event as KeyboardEvent);
    globalThis.addEventListener("keydown", listener);
    try {
      expect(replayForwardedChord("Ctrl+R")).toBe(true);
      expect(seen).toHaveLength(1);
      expect(seen[0].key).toBe("r");
      expect(seen[0].ctrlKey).toBe(true);
      expect(seen[0].cancelable).toBe(true);
    } finally {
      globalThis.removeEventListener("keydown", listener);
    }
  });

  it("dispatches nothing for a chord it cannot represent", () => {
    const listener = vi.fn();
    globalThis.addEventListener("keydown", listener);
    try {
      expect(replayForwardedChord("Ctrl+Click")).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      globalThis.removeEventListener("keydown", listener);
    }
  });
});
