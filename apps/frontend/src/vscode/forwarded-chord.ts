/**
 * Replay a keyboard shortcut VS Code claimed, as though it had been typed.
 *
 * A webview only receives a keystroke the workbench did not take first, so every chord VS Code
 * binds at the workbench level — `Ctrl+R` is its recent-files list — never reached the canvas.
 * The extension contributes those chords and relays them as `gsim/forwardedChord`.
 *
 * This turns the chord back into a `keydown` on `window`, which is where `KeymapProvider`
 * listens. Replaying the event rather than looking the action up directly is the point: the
 * forwarded keystroke then meets the same context resolution, the same chord-sequence state
 * and the same "is the user typing in a field" guard as a physical one. A second dispatch path
 * would be a second set of rules to keep in step.
 */

/** Keymap chord spellings for keys whose `KeyboardEvent.key` differs. */
const KEY_NAMES: Readonly<Record<string, string>> = {
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Up: "ArrowUp",
  Down: "ArrowDown",
  Esc: "Escape",
  Space: " ",
  Del: "Delete",
};

export interface SyntheticChord {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Split a chord into the event it stands for, or `null` if it is not one keystroke.
 *
 * The keymap also documents mouse gestures and key families (`Ctrl+Click`, `Arrow`), which no
 * single event represents. The extension never forwards those — it contributes keybindings
 * only for real chords — so reaching one here means the two sides disagree, and dispatching a
 * guess would fire an arbitrary action.
 */
export function chordToKeyboardEvent(chord: string): SyntheticChord | null {
  if (chord.includes(",")) return null; // a two-stroke sequence, not one keystroke
  if (/Click|Drag/.test(chord)) return null;

  // Split on `+` while keeping a trailing literal `+` (`Ctrl++` is Ctrl and the plus key).
  const parts = chord.split("+");
  if (parts.length > 1 && parts[parts.length - 1] === "") {
    parts.pop();
    parts[parts.length - 1] = "+";
  }

  const event: SyntheticChord = { key: "", ctrlKey: false, altKey: false, shiftKey: false };
  for (const [index, part] of parts.entries()) {
    const last = index === parts.length - 1;
    if (!last && part === "Ctrl") {
      event.ctrlKey = true;
    } else if (!last && part === "Alt") {
      event.altKey = true;
    } else if (!last && part === "Shift") {
      event.shiftKey = true;
    } else if (last) {
      event.key = KEY_NAMES[part] ?? (part.length === 1 ? part.toLowerCase() : part);
    } else {
      return null; // an unknown modifier: better no action than the wrong one
    }
  }
  if (event.key === "" || event.key === "Arrow") return null;
  return event;
}

/** Dispatch the chord on `window`, where the canvas listens. Returns false if it is not one. */
export function replayForwardedChord(chord: string): boolean {
  const synthetic = chordToKeyboardEvent(chord);
  if (!synthetic) return false;
  globalThis.dispatchEvent(
    new KeyboardEvent("keydown", {
      ...synthetic,
      bubbles: true,
      cancelable: true,
    }),
  );
  return true;
}
