import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The same normalisation the generator uses, imported rather than rewritten: the two tables
// spell the same keystroke differently (`Ctrl++` against VS Code's `Ctrl+=`), and a second
// copy of that rule is the drift this change exists to avoid.
import { normaliseChord } from "../../../scripts/chord.mjs";
import { VSCODE_DEFAULTS } from "./vscode-default-keybindings";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const pkg = JSON.parse(
  readFileSync(join(REPO_ROOT, "apps/vscode-extension/package.json"), "utf8"),
) as {
  contributes: {
    keybindings?: Array<{ key: string; command: string; when?: string; args?: { chord: string } }>;
    configuration: { properties: Record<string, { default?: unknown; type?: string }> };
  };
};
const keybindings = pkg.contributes.keybindings ?? [];

describe("the schematic takes its chords back from VS Code", () => {
  it("contributes a keybinding for every workbench chord that collides", () => {
    // The extension contributed none at all, which is why Ctrl+R opened VS Code's recent-files
    // list instead of rotating: a webview only sees a keystroke the workbench did not claim.
    const workbenchChords = VSCODE_DEFAULTS.filter((d) => d.scope === "workbench").map((d) =>
      normaliseChord(d.chord),
    );
    const contributed = keybindings.map((k) => normaliseChord(k.args?.chord ?? ""));
    expect(contributed.length).toBeGreaterThanOrEqual(25);
    for (const chord of contributed) {
      expect(workbenchChords, `${chord} is contributed but is not a workbench collision`).toContain(
        chord,
      );
    }
  });

  it("claims Ctrl+R, the chord that was reported", () => {
    const rotate = keybindings.find((k) => k.args?.chord === "Ctrl+R");
    expect(rotate, "Ctrl+R is not claimed").toBeDefined();
    expect(rotate?.key).toBe("ctrl+r");
    expect(rotate?.command).toBe("generalSimulator.forwardChord");
  });

  it("claims nothing outside a focused schematic", () => {
    // Without `activeCustomEditorId` these would fire everywhere — a source file, the
    // explorer, a terminal — and Ctrl+S would stop saving a file the user was editing.
    for (const binding of keybindings) {
      expect(binding.when, `${binding.key} has no guard`).toContain(
        "activeCustomEditorId == 'generalSimulator.schematic'",
      );
      expect(binding.when, `${binding.key} ignores the setting`).toContain(
        "config.generalSimulator.overrideVsCodeKeybindings",
      );
    }
  });

  it("claims no editor-scoped chord", () => {
    // An editor command carries a focus condition that is false with a schematic focused, so
    // the keystroke already arrives. Claiming it would take it from whatever has focus *inside*
    // the webview and break typing in a parameter field.
    const editorOnly = new Set(
      VSCODE_DEFAULTS.filter((d) => d.scope === "editor").map((d) => normaliseChord(d.chord)),
    );
    const wrong = keybindings
      .map((k) => normaliseChord(k.args?.chord ?? ""))
      .filter((chord) => editorOnly.has(chord));
    expect(wrong, "these are editor-scoped and must be left alone").toEqual([]);
  });

  it("defaults to the schematic winning", () => {
    const setting =
      pkg.contributes.configuration.properties["generalSimulator.overrideVsCodeKeybindings"];
    expect(setting).toBeDefined();
    expect(setting.type).toBe("boolean");
    // A schematic where Ctrl+R opens a file picker is the broken case, so the fix is on by
    // default and the setting exists to turn it off.
    expect(setting.default).toBe(true);
  });

  it("the generator can read every entry in the reference table", () => {
    // `gen-keybindings.mjs` parses this module with a regular expression, because a Node
    // script cannot import TypeScript. That is brittle in one specific way: a formatting
    // change that reflows an entry makes the regex skip it *silently*, and the generator then
    // reports fewer conflicts and contributes fewer keybindings with no error anywhere. It
    // happened — a stray space before a comma cut 89 entries down to 16.
    const source = readFileSync(
      join(REPO_ROOT, "apps/vscode-extension/src/vscode-default-keybindings.ts"),
      "utf8",
    );
    const parsable =
      /\{\s*chord:\s*"((?:[^"\\]|\\.)*)"\s*,\s*command:\s*"([^"]+)"\s*,\s*does:\s*"([^"]+)"\s*,\s*scope:\s*"(workbench|editor)"/g;
    expect([...source.matchAll(parsable)]).toHaveLength(VSCODE_DEFAULTS.length);
  });

  it("forwards every claimed chord through one command", () => {
    for (const binding of keybindings) {
      expect(binding.command).toBe("generalSimulator.forwardChord");
      expect(typeof binding.args?.chord).toBe("string");
    }
  });
});
