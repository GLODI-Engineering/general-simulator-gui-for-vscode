#!/usr/bin/env node
/**
 * Check the library's supported-type list against the engine's own registry.
 *
 * `general-simulator` is the contract (AGENTS.md invariant 0a): what the
 * library offers should be what the engine can run. The authority is
 * gsim-core's `compile/spec.rs` REGISTRY, which lives in a sibling
 * repository — so this cannot be an ordinary unit test, and is a script CI
 * runs only when that checkout is present.
 *
 * It exists because the two lists had already drifted: four types the engine
 * compiles were missing from the library, which hid working parts from the
 * user with nothing reporting it.
 *
 *   node scripts/check-simulator-compat.mjs [path-to-gsim-core]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gsimCore = path.resolve(
  process.argv[2] ?? path.join(repoRoot, "..", "gsim-core"),
);
const specPath = path.join(gsimCore, "crates", "gsim-core", "src", "compile", "spec.rs");

let spec;
try {
  spec = readFileSync(specPath, "utf-8");
} catch {
  console.log(`check-simulator-compat: no engine checkout at ${gsimCore} — skipped.`);
  console.log("Pass its path as the first argument to check against it.");
  process.exit(0);
}

/** Never user-placeable: an internal boundary the compiler inserts itself. */
const INTERNAL = new Set(["spice-subckt.boundary"]);

const registry = new Set(
  [...spec.matchAll(/"([a-z_]+\.[a-z0-9_.]+)"/g)].map((m) => m[1]).filter((n) => !INTERNAL.has(n)),
);

// Parsed with a regex rather than a YAML library: this script runs from the
// repo root, where js-yaml is not a dependency, and the file it reads is a
// flat `- type.name` sequence under one key. A parser would be the right call
// the moment the shape stops being that simple.
const compatText = readFileSync(
  path.join(repoRoot, "apps/frontend/src/library/simulator-compat.yaml"),
  "utf-8",
);
const listed = new Set(
  [...compatText.matchAll(/^\s*-\s+([a-z_]+\.[a-z0-9_.]+)\s*$/gm)].map((m) => m[1]),
);

const missing = [...registry].filter((n) => !listed.has(n)).sort();
const extra = [...listed].filter((n) => !registry.has(n)).sort();

console.log(`registry: ${registry.size}   listed: ${listed.size}`);
if (missing.length === 0 && extra.length === 0) {
  console.log("check-simulator-compat: in sync.");
  process.exit(0);
}
if (missing.length > 0) {
  console.error(`\n${missing.length} type(s) the engine compiles are NOT offered by the library:`);
  for (const n of missing) console.error(`  + ${n}`);
}
if (extra.length > 0) {
  console.error(`\n${extra.length} type(s) the library offers that the engine cannot compile:`);
  for (const n of extra) console.error(`  - ${n}`);
}
console.error(
  "\nUpdate apps/frontend/src/library/simulator-compat.yaml *and* the inline copy in\n" +
    "simulator-compat.ts, then update the count in simulator-compat-sync.test.ts.",
);
process.exit(1);
