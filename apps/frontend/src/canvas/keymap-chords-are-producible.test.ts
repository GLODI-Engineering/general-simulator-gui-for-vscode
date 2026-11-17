import { describe, expect, it } from "vitest";

import { eventToChords } from "./KeymapProvider";
import { chordSteps, keyBindings } from "./keymap";

/**
 * A chord the keymap declares must be one a keystroke can actually produce.
 *
 * `scripts/check-keymap.mjs` checks the other direction — that every chord documented in
 * `docs/keyboard-map.md` is registered in `keymap.ts` — so a binding could be declared,
 * documented, listed as a VS Code conflict, and still be unreachable. Four were: the
 * `positioning.align-*` commands were bound to `Ctrl+Alt+Left`/`Right`/`Up`/`Down` while the
 * provider collapsed every arrow to `Arrow`, so pressing them produced `Ctrl+Alt+Arrow`, which
 * nothing was bound to. Aligning a selection by keyboard did nothing at all.
 *
 * This closes that direction by going through `eventToChords` itself rather than re-deriving
 * what it ought to emit.
 */

/**
 * The keystroke a user would make to spell one chord step.
 *
 * Modifiers are stripped from the front rather than by splitting on `+`, because `+` is itself
 * a key: `Ctrl++` is Ctrl and the plus key, and splitting would read it as an empty key name.
 */
function eventFor(step: string): KeyboardEvent {
  let rest = step;
  let ctrlKey = false;
  let altKey = false;
  let shiftKey = false;
  for (;;) {
    if (rest.startsWith("Ctrl+")) {
      ctrlKey = true;
      rest = rest.slice("Ctrl+".length);
    } else if (rest.startsWith("Alt+")) {
      altKey = true;
      rest = rest.slice("Alt+".length);
    } else if (rest.startsWith("Shift+")) {
      shiftKey = true;
      rest = rest.slice("Shift+".length);
    } else {
      break;
    }
  }
  const key =
    rest === "Space"
      ? " "
      : ["Left", "Right", "Up", "Down"].includes(rest)
        ? `Arrow${rest}`
        : rest === "Arrow"
          ? "ArrowLeft" // any direction produces the generic spelling
          : rest;
  return new KeyboardEvent("keydown", { key, ctrlKey, altKey, shiftKey });
}

describe("every chord in the keymap is one a keystroke can produce", () => {
  // A chord can be several keystrokes in order -- "Ctrl+.,Ctrl+.", and also "Space+F", which
  // is Space then F rather than a held Space. `chordSteps` is the resolver's own split, so this
  // checks exactly the steps the resolver will look for.
  const steps = keyBindings.flatMap((binding) =>
    chordSteps(binding.chord).map((step) => ({ id: binding.id, step })),
  );

  it("covers the whole keymap", () => {
    expect(steps.length).toBeGreaterThan(40);
  });

  it.each(steps)("$id: $step", ({ step }) => {
    expect(eventToChords(eventFor(step))).toContain(step);
  });

  it("produces the direction-specific spelling before the generic one for an arrow", () => {
    // Order is what makes both work at once: the align commands name a direction, while nudge,
    // pan and extend-selection are bound to the generic spelling and read the direction off the
    // event. If the generic came first it would shadow all four align bindings.
    expect(eventToChords(eventFor("Ctrl+Alt+Left"))).toEqual(["Ctrl+Alt+Left", "Ctrl+Alt+Arrow"]);
    expect(eventToChords(eventFor("Shift+Arrow"))).toEqual(["Shift+Left", "Shift+Arrow"]);
  });
});
