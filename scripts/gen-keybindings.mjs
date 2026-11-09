#!/usr/bin/env node
/**
 * Contribute a VS Code keybinding for every chord the schematic binds, and publish the
 * conflict list.
 *
 * The extension contributed **no** keybindings at all. The schematic registers 95 chords in
 * the webview, and a webview only sees a keystroke VS Code did not claim first — so Ctrl+R
 * opened VS Code's recent-files picker instead of rotating a component, and so did every other
 * chord VS Code binds by default. The webview cannot win that race from inside; the extension
 * has to claim the chord at the workbench level and forward it in.
 *
 * Generated from `apps/frontend/src/canvas/keymap.ts` rather than written, because a
 * hand-kept copy of 95 chords is the same drift this repository has just spent a week
 * removing. `--check` fails when `package.json` or the published list stops matching the
 * keymap.
 *
 *   node scripts/gen-keybindings.mjs           # write
 *   node scripts/gen-keybindings.mjs --check   # verify, exit 1 on drift
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isRealChord, normaliseChord as normalise, toVsCodeChord } from "./chord.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEYMAP = join(REPO_ROOT, "apps/frontend/src/canvas/keymap.ts");
const DEFAULTS = join(REPO_ROOT, "apps/vscode-extension/src/vscode-default-keybindings.ts");
const PACKAGE = join(REPO_ROOT, "apps/vscode-extension/package.json");
const DOC = join(REPO_ROOT, "docs/keyboard-conflicts.md");
const CHECK = process.argv.includes("--check");

/**
 * The context the schematic owns the keyboard in.
 *
 * `activeCustomEditorId` is true only while a schematic tab is the active editor, so a chord
 * is claimed in the schematic and left alone everywhere else — the file explorer, a terminal,
 * a source file. The setting lets a user hand the chords back to VS Code; it defaults to the
 * schematic winning, because a schematic where Ctrl+R opens a file picker is the broken case.
 */
const WHEN =
  "activeCustomEditorId == 'generalSimulator.schematic' && " +
  "config.generalSimulator.overrideVsCodeKeybindings";

/** `{ id, label, chord, contexts }` for each binding the schematic declares. */
function readKeymap() {
  const source = readFileSync(KEYMAP, "utf8");
  const body = source.slice(source.indexOf("export const keyBindings"));
  const bindings = [];
  const re =
    /id:\s*"([^"]+)"[^}]*?label:\s*"((?:[^"\\]|\\.)*)"[^}]*?chord:\s*"([^"]+)"[^}]*?contexts:\s*\[([^\]]*)\]/gs;
  for (const [, id, label, chord, contexts] of body.matchAll(re)) {
    bindings.push({
      id,
      label: label.replace(/\\"/g, '"'),
      chord,
      contexts: [...contexts.matchAll(/"([^"]+)"/g)].map(([, c]) => c),
    });
  }
  if (bindings.length === 0) throw new Error(`parsed no bindings from ${KEYMAP}`);
  return bindings;
}

/** VS Code's defaults, read from the reference module so there is one copy of them. */
function readVsCodeDefaults() {
  const source = readFileSync(DEFAULTS, "utf8");
  const defaults = new Map();
  const re =
    /\{\s*chord:\s*"((?:[^"\\]|\\.)*)"\s*,\s*command:\s*"([^"]+)"\s*,\s*does:\s*"([^"]+)"\s*,\s*scope:\s*"(workbench|editor)"/g;
  for (const [, chord, command, does, scope] of source.matchAll(re)) {
    const literal = chord.replace(/\\\\/g, "\\");
    defaults.set(normalise(literal), { chord: literal, command, does, scope });
  }
  if (defaults.size === 0) throw new Error(`parsed no defaults from ${DEFAULTS}`);
  return defaults;
}

const bindings = readKeymap();
const vscodeDefaults = readVsCodeDefaults();

// One keybinding per distinct chord. Several schematic actions can share a chord in different
// contexts (Delete in a selection, Delete while drawing a wire); which one runs is the
// webview's decision, made from its own context, so the extension forwards the chord and does
// not try to resolve it here.
const byChord = new Map();
for (const binding of bindings) {
  if (!byChord.has(binding.chord)) byChord.set(binding.chord, []);
  byChord.get(binding.chord).push(binding);
}

const conflicts = [...byChord.entries()]
  .filter(([chord]) => isRealChord(chord) && vscodeDefaults.has(normalise(chord)))
  .map(([chord, actions]) => ({
    chord,
    ours: actions,
    theirs: vscodeDefaults.get(normalise(chord)),
  }))
  .sort((a, b) => a.chord.localeCompare(b.chord));

// Claimed: the conflicts VS Code would otherwise win. Only the workbench-scoped ones, because
// an editor-scoped binding never fires with a schematic focused — and claiming it would take
// the keystroke from whatever has focus *inside* the webview, breaking typing in a parameter
// field to fix a conflict that does not exist.
const claimed = conflicts.filter(({ theirs }) => theirs.scope === "workbench");
const harmless = conflicts.filter(({ theirs }) => theirs.scope === "editor");

const keybindings = claimed.map(({ chord }) => ({
  key: toVsCodeChord(chord),
  command: "generalSimulator.forwardChord",
  when: WHEN,
  args: { chord },
}));

const pkg = JSON.parse(readFileSync(PACKAGE, "utf8"));
pkg.contributes.keybindings = keybindings;

/**
 * The repository's own formatter decides the final text.
 *
 * `JSON.stringify` puts every array element on its own line; biome collapses short ones. Both
 * are valid JSON and they are not the same bytes, so a generator that formatted the file
 * itself would be reformatted by `biome check` on the next commit and then fail its own
 * `--check`. Formatting through biome means there is one canonical form.
 */
function formatted(text, extension) {
  return execFileSync(
    "pnpm",
    ["-s", "exec", "biome", "format", `--stdin-file-path=gen.${extension}`],
    {
      input: text,
      encoding: "utf8",
      cwd: REPO_ROOT,
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
}

const pkgText = formatted(`${JSON.stringify(pkg, null, 2)}\n`, "json");

const doc = `# Keyboard shortcuts: the schematic and VS Code

<!-- Generated by scripts/gen-keybindings.mjs. Do not edit by hand. -->

The schematic binds **${byChord.size}** entries. **${conflicts.length}** of them use a chord VS
Code also binds by default, and **${claimed.length}** of those were being lost: a webview only
sees a keystroke the workbench did not claim first, so \`Ctrl+R\` opened the recent-files picker
rather than rotating the selected component.

The extension now claims those ${claimed.length} chords while a schematic is the active editor
and forwards the keystroke into the canvas. Everywhere else — a source file, the explorer, a
terminal — VS Code keeps them.

## Choosing who wins

\`generalSimulator.overrideVsCodeKeybindings\`, default **true**: the schematic's shortcuts
override VS Code's while a schematic tab is focused. Set it to \`false\` to hand every chord
back to VS Code, at the cost of the schematic shortcuts that collide.

It is read through the keybinding's \`when\` clause, so a change takes effect at once and needs
no reload.

## The ${claimed.length} chords taken back from VS Code

| Chord | In the schematic | What VS Code did with it |
| --- | --- | --- |
${claimed
  .map(
    ({ chord, ours, theirs }) =>
      `| \`${chord}\` | ${ours.map((o) => o.label).join("; ")} | ${theirs.does} |`,
  )
  .join("\n")}

## The ${harmless.length} that only look like conflicts

These chords are VS Code defaults too, but every one of them is an **editor** command, carrying
a focus condition that is false while a schematic is focused. The keystroke already reaches the
canvas, so the extension leaves them alone — claiming one would take it from whatever has focus
inside the webview and break typing in a parameter field.

| Chord | In the schematic | VS Code's editor command |
| --- | --- | --- |
${harmless
  .map(
    ({ chord, ours, theirs }) =>
      `| \`${chord}\` | ${ours.map((o) => o.label).join("; ")} | ${theirs.does} |`,
  )
  .join("\n")}

## Entries that are not VS Code chords

The keymap documents the schematic's whole input surface, not only keyboard chords. These never
reach VS Code's keybinding system and need nothing from it: mouse gestures, a key family
standing for four keys at once, the held-Space modal, and tools with no shortcut assigned yet.

| Entry | In the schematic |
| --- | --- |
${[...byChord.entries()]
  .filter(([chord]) => !isRealChord(chord))
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(
    ([chord, actions]) =>
      `| ${chord === "" ? "_(no shortcut)_" : `\`${chord}\``} | ${actions
        .map((a) => a.label)
        .join("; ")} |`,
  )
  .join("\n")}

## Chords VS Code leaves alone

These ${byChord.size - conflicts.length - [...byChord.keys()].filter((c) => !isRealChord(c)).length}
already worked, and are listed so the whole keymap is visible in one place.

| Chord | In the schematic |
| --- | --- |
${[...byChord.entries()]
  .filter(([chord]) => isRealChord(chord) && !vscodeDefaults.has(normalise(chord)))
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([chord, actions]) => `| \`${chord}\` | ${actions.map((a) => a.label).join("; ")} |`)
  .join("\n")}
`;

if (CHECK) {
  let drifted = false;
  for (const [path, want] of [
    [PACKAGE, pkgText],
    [DOC, doc],
  ]) {
    let have = "";
    try {
      have = readFileSync(path, "utf8");
    } catch {
      have = "";
    }
    if (have !== want) {
      console.error(`gen-keybindings: ${path} does not match the schematic's keymap.`);
      drifted = true;
    }
  }
  if (drifted) {
    console.error("Run `node scripts/gen-keybindings.mjs` and commit the result.");
    process.exit(1);
  }
  console.log(
    `gen-keybindings: ${keybindings.length} keybindings and the conflict list match the keymap.`,
  );
  process.exit(0);
}

writeFileSync(PACKAGE, pkgText);
writeFileSync(DOC, doc);
console.log(
  `gen-keybindings: ${conflicts.length} chords collide with VS Code defaults; ` +
    `contributed ${keybindings.length} to take back the workbench ones, ` +
    `left ${harmless.length} editor-scoped chords alone.`,
);
