#!/usr/bin/env node
/**
 * Write the front end's component catalogue from the engine itself.
 *
 * The engine owns the component library — labels, categories, port geometry, parameters and
 * their defaults — and says for each component whether it can compile it. This script moves
 * that declaration into the front end and reshapes it into what `loadCatalog` already reads;
 * it never edits the content. `--check` fails when the committed copy stops matching, which
 * is what keeps these files a cache of the engine's answer instead of a second opinion.
 *
 * Two files, because the front end asks two different questions:
 *   engine-catalog.json       what to show, in the shape `catalog-core.loadCatalog` takes
 *   engine-capabilities.json  the compile facts, per engine type
 *
 * Needs `gsim_py` importable. Without it the committed files stand and `--check` says so
 * rather than failing: a checkout without the Rust toolchain is a working checkout.
 *
 *   node scripts/gen-engine-catalog.mjs           # write
 *   node scripts/gen-engine-catalog.mjs --check   # verify, exit 1 on drift
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(REPO_ROOT, "apps/frontend/src/library");
const CHECK = process.argv.includes("--check");

/** Ask the engine. `null` when `gsim_py` is not importable here. */
function fromEngine(call) {
  const python = process.env.GSIM_PYTHON ?? "python3";
  try {
    return execFileSync(python, ["-c", `import gsim_py; print(gsim_py.${call}())`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * The engine's catalogue in the shape `loadCatalog` reads: `{filePath, metadata}` records.
 *
 * `filePath` is where the component is declared, which is now a path inside the engine rather
 * than a file in this repository. It is kept because `loadCatalog` reports it in errors, and
 * pointing at the engine is the honest answer to "where does this component come from".
 */
function toCatalogEntries(catalog) {
  return catalog.components.map((component) => {
    const { id, compilable, compiles_to: compilesTo, ...rest } = component;
    return {
      filePath: `gsim-core/crates/gsim-core/data/component-library.json#${id}`,
      metadata: {
        ...rest,
        // `loadCatalog` keys entries by `name`, `type` and every alias, so a sheet saved under
        // the catalogue's old spelling still resolves — those spellings are in `aliases`.
        name: rest.name ?? id,
        ...(rest.type ? { type: rest.type } : {}),
        engineId: id,
        engineType: compilesTo ?? null,
        compilable,
      },
    };
  });
}

const catalogRaw = fromEngine("catalog");
const capabilitiesRaw = fromEngine("capabilities");
if (catalogRaw === null || capabilitiesRaw === null) {
  console.log(
    "gen-engine-catalog: gsim_py is not importable here — leaving the committed files " +
      "alone. Set GSIM_PYTHON to an interpreter that has it to regenerate.",
  );
  process.exit(0);
}

const catalog = JSON.parse(catalogRaw);
const outputs = [
  [join(LIB, "engine-catalog.json"), toCatalogEntries(catalog)],
  [join(LIB, "engine-capabilities.json"), JSON.parse(capabilitiesRaw)],
];

let drifted = false;
for (const [path, value] of outputs) {
  const formatted = `${JSON.stringify(value, null, 2)}\n`;
  if (!CHECK) {
    writeFileSync(path, formatted);
    continue;
  }
  let committed = "";
  try {
    committed = readFileSync(path, "utf8");
  } catch {
    committed = "";
  }
  if (committed !== formatted) {
    console.error(`gen-engine-catalog: ${path} does not match what the engine declares.`);
    drifted = true;
  }
}

if (CHECK) {
  if (drifted) {
    console.error("Run `node scripts/gen-engine-catalog.mjs` and commit the result.");
    process.exit(1);
  }
  console.log("gen-engine-catalog: the committed catalogue matches the engine.");
  process.exit(0);
}

const compilable = catalog.components.filter((c) => c.compilable).length;
console.log(
  `gen-engine-catalog: wrote ${catalog.components.length} components ` +
    `(${compilable} compilable) from ${catalog.generator}`,
);
