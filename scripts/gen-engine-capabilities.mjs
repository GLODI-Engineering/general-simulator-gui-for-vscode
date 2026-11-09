#!/usr/bin/env node
/**
 * Write `apps/frontend/src/library/engine-capabilities.json` from the engine itself.
 *
 * The engine declares what it can compile — every type, its ports, and every parameter its
 * card reads — through `gsim_py.capabilities()`. This script only moves that declaration into
 * the front end; it never edits it. `--check` fails when the committed copy no longer matches
 * what the engine says, which is the point: the file is a cache of the engine's answer, not a
 * second opinion about it.
 *
 * Needs `gsim_py` importable (see packages/simulator/.../gsim_py_netlist.py for the build).
 * Without it the committed file stands and `--check` says so rather than failing, because a
 * checkout without the Rust toolchain is a working checkout.
 *
 *   node scripts/gen-engine-capabilities.mjs           # write
 *   node scripts/gen-engine-capabilities.mjs --check   # verify, exit 1 on drift
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(REPO_ROOT, "apps/frontend/src/library/engine-capabilities.json");
const CHECK = process.argv.includes("--check");

function fromEngine() {
  const python = process.env.GSIM_PYTHON ?? "python3";
  try {
    return execFileSync(python, ["-c", "import gsim_py; print(gsim_py.capabilities())"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

const live = fromEngine();
if (live === null) {
  console.log(
    "gen-engine-capabilities: gsim_py is not importable here — leaving the committed " +
      "manifest alone. Set GSIM_PYTHON to an interpreter that has it to regenerate.",
  );
  process.exit(0);
}

const formatted = `${JSON.stringify(JSON.parse(live), null, 2)}\n`;

if (CHECK) {
  const committed = readFileSync(OUT, "utf8");
  if (committed !== formatted) {
    console.error(
      "gen-engine-capabilities: the committed manifest does not match what the engine " +
        "declares. Run `node scripts/gen-engine-capabilities.mjs` and commit the result.",
    );
    process.exit(1);
  }
  console.log("gen-engine-capabilities: the manifest matches the engine.");
  process.exit(0);
}

writeFileSync(OUT, formatted);
console.log(`gen-engine-capabilities: wrote ${JSON.parse(live).types.length} types to ${OUT}`);
