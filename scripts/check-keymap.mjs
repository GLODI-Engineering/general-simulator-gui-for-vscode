#!/usr/bin/env node
/**
 * Keymap drift check — FE-07.
 *
 * Parses the chord tables in docs/specs/keyboard-map.md §1–§9 and checks that
 * every keyboard-only chord is registered in apps/frontend/src/canvas/keymap.ts
 * for the expected dispatch context. Mouse and wheel gestures are intentionally
 * excluded: they are documented in the map but are not keymap registry entries.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const VERBOSE = process.argv.includes("--verbose");

function optionPath(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? resolve(process.cwd(), arg.slice(prefix.length)) : fallback;
}

const KEYMAP_MD = optionPath("map", join(REPO_ROOT, "docs", "specs", "keyboard-map.md"));
const KEYMAP_TS = optionPath(
  "registry",
  join(REPO_ROOT, "apps", "frontend", "src", "canvas", "keymap.ts"),
);

const MOUSE_PATTERN = /Click|Drag|ScrollWheel|double-click/i;

function normalizeContext(action, contextCell) {
  const actionText = action.toLowerCase();
  const contextText = contextCell.toLowerCase();

  if (contextText.includes("global") || contextText.includes("simulation running")) {
    return "global";
  }
  if (contextText.includes("port-to-port") || contextText.includes("drawing-wire")) {
    return "drawing-wire";
  }
  if (contextText.includes("connected block")) {
    return "connected-block";
  }
  if (
    actionText === "move cursor to nearest element" ||
    actionText === "extend selection to adjacent"
  ) {
    return "canvas";
  }
  if (
    contextText.includes("selected") ||
    contextText.includes("masked block") ||
    contextText.includes("linked block") ||
    contextText.includes("selection mode") ||
    contextText.includes("during drag")
  ) {
    return "selection";
  }
  if (contextText.includes("canvas") || contextText.includes("inside subsystem")) {
    return "canvas";
  }
  return "global";
}

function parseSpecBindings(markdown) {
  const bindings = [];
  let inScope = false;

  for (const line of markdown.split("\n")) {
    const sectionMatch = line.match(/^## (\d+)\./);
    if (sectionMatch) {
      const section = Number.parseInt(sectionMatch[1], 10);
      inScope = section >= 1 && section <= 9;
      continue;
    }
    if (!inScope) {
      continue;
    }
    if (!line.startsWith("|") || line.startsWith("| Action") || line.startsWith("|---")) {
      continue;
    }

    const columns = line.split("|").map((part) => part.trim());
    const action = columns[1] ?? "";
    const chordCell = columns[2] ?? "";
    const contextCell = columns[3] ?? "";
    const context = normalizeContext(action, contextCell);
    const chordTokens = chordCell.match(/`([^`]+)`/g) ?? [];

    for (const token of chordTokens) {
      const chord = token.slice(1, -1);
      if (!MOUSE_PATTERN.test(chord)) {
        bindings.push({ action, chord, context });
      }
    }
  }

  return bindings;
}

function parseCodeBindings(source) {
  const bindings = [];
  const bindingPattern =
    /{\s*id:\s*["']([^"']+)["'][\s\S]*?label:\s*["']([^"']+)["'][\s\S]*?chord:\s*["']([^"']+)["'][\s\S]*?contexts:\s*\[([^\]]*)\][\s\S]*?}/g;

  for (const match of source.matchAll(bindingPattern)) {
    const [, id, label, chord, contextSource] = match;
    const contexts = [...contextSource.matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
    for (const context of contexts) {
      bindings.push({ id, label, chord, context });
    }
  }

  return bindings;
}

const specBindings = parseSpecBindings(readFileSync(KEYMAP_MD, "utf8"));
const codeBindings = parseCodeBindings(readFileSync(KEYMAP_TS, "utf8"));
const codeByChordContext = new Map(
  codeBindings.map((binding) => [`${binding.chord}@@${binding.context}`, binding]),
);
const codeChords = new Set(codeBindings.map((binding) => binding.chord));
const specChords = new Set(specBindings.map((binding) => binding.chord));

const missing = specBindings.filter(
  (binding) => !codeByChordContext.has(`${binding.chord}@@${binding.context}`),
);
const contextDrift = missing.filter((binding) => codeChords.has(binding.chord));
const absent = missing.filter((binding) => !codeChords.has(binding.chord));
const extraChords = [...codeChords].filter((chord) => !specChords.has(chord));

if (VERBOSE) {
  console.log(`Spec bindings (§1–§9, keyboard-only): ${specBindings.length}`);
  console.log(`Spec chords (§1–§9, keyboard-only):   ${specChords.size}`);
  console.log(`Code bindings (keymap.ts):            ${codeBindings.length}`);
  console.log(`Code chords (keymap.ts):              ${codeChords.size}`);
  if (extraChords.length > 0) {
    console.log("\nChords in code but not in spec §1–§9 (informational, not an error):");
    for (const chord of extraChords.sort()) {
      console.log(`  + ${chord}`);
    }
  }
}

if (missing.length === 0) {
  console.log(
    `check-keymap: OK — all ${specBindings.length} spec bindings are registered in keymap.ts`,
  );
  process.exit(0);
}

console.error(
  `check-keymap: DRIFT — ${missing.length} binding(s) from keyboard-map.md §1–§9 are missing or registered under the wrong context:`,
);
for (const binding of absent) {
  console.error(`  missing: ${binding.chord} @ ${binding.context} (${binding.action})`);
}
for (const binding of contextDrift) {
  const registeredContexts = codeBindings
    .filter((candidate) => candidate.chord === binding.chord)
    .map((candidate) => candidate.context)
    .sort()
    .join(", ");
  console.error(
    `  context: ${binding.chord} expected @ ${binding.context} (${binding.action}); registered @ ${registeredContexts}`,
  );
}
console.error(
  "\nFix: update apps/frontend/src/canvas/keymap.ts, or update docs/specs/keyboard-map.md if the binding changed intentionally.",
);
process.exit(1);
