/**
 * One spelling for a keystroke, shared by the generator and the tests.
 *
 * The schematic's keymap and VS Code's defaults write the same keystroke differently — `Esc`
 * against `Escape`, `Ctrl++` against `Ctrl+=` — so comparing the strings as written finds no
 * conflict for either. Both sides of the comparison must normalise the same way, which is why
 * this is a module and not a function in each of them.
 */

const ALIASES = new Map([
  ["esc", "escape"],
  ["del", "delete"],
  ["return", "enter"],
  ["+", "="],
  ["pgup", "pageup"],
  ["pgdn", "pagedown"],
]);

/** `Ctrl++` and `Ctrl+=` both become `ctrl+=`. */
export function normaliseChord(chord) {
  return chord
    .split("+")
    .map((part, index, parts) => {
      // A trailing empty part means the chord ended in a literal `+` (`Ctrl++`).
      const key = part === "" && index === parts.length - 1 ? "+" : part.toLowerCase();
      return ALIASES.get(key) ?? key;
    })
    .filter((part) => part !== "")
    .join("+");
}

/**
 * Whether this is a keystroke VS Code could be asked to bind at all.
 *
 * The keymap documents the whole input surface, not just keyboard chords: mouse gestures
 * (`Ctrl+Click`), key families standing for four keys at once (`Arrow`), a held-Space modal
 * (`Space+F`), and tools with no shortcut yet (an empty chord). A contributed keybinding for
 * any of those is an entry VS Code cannot parse.
 */
export function isRealChord(chord) {
  if (chord === "") return false;
  if (/Click|Drag/.test(chord)) return false;
  if (/\bArrow\b/.test(chord)) return false;
  if (/^Space\b|\bSpace\+/.test(chord)) return false;
  return true;
}

/**
 * `Ctrl+Shift+R` -> `ctrl+shift+r`, which is how VS Code writes a chord.
 *
 * A two-stroke sequence is a comma in the keymap and a space in VS Code: the keymap's
 * `Ctrl+.,Ctrl+.` is VS Code's `ctrl+. ctrl+.`.
 */
export function toVsCodeChord(chord) {
  return chord
    .split(",")
    .map((stroke) =>
      stroke
        .split("+")
        .map((part, index, parts) =>
          part === "" && index === parts.length - 1 ? "+" : part.toLowerCase(),
        )
        .filter((part) => part !== "")
        .join("+"),
    )
    .join(" ");
}
