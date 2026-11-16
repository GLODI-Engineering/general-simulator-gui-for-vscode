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
 * Every component the engine submits is validated against the block-metadata
 * schema before anything is written. The drift check answers "did the engine's
 * answer change?"; this answers "is the engine's answer a legal one?" -- a
 * different question, and the one that was never asked. A malformed component
 * used to flow through here into the front end untouched, to be discovered as
 * a blank symbol or a missing port on somebody's sheet.
 *
 *   node scripts/gen-engine-catalog.mjs           # write
 *   node scripts/gen-engine-catalog.mjs --check   # verify, exit 1 on drift
 */

import Ajv from "ajv/dist/2020.js";

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

/**
 * The contract the engine's submission has to satisfy.
 *
 * `block-metadata.schema.json` is the front end's half of the bargain: it says
 * what a component declaration must look like for this app to be able to draw
 * it, search it and offer its parameters. The engine owns *which* components
 * exist; this owns *what shape* a component is described in. Validating here
 * is what makes it a contract rather than a convention.
 */
const SCHEMA = JSON.parse(
  readFileSync(
    join(REPO_ROOT, "packages/schemas/definitions/blocks/block-metadata.schema.json"),
    "utf8",
  ),
);
const validateComponent = new Ajv({ strict: false, allErrors: true }).compile(SCHEMA);

const entries = toCatalogEntries(catalog);
const offenders = [];
for (const entry of entries) {
  if (validateComponent(entry.metadata)) continue;
  const why = validateComponent.errors
    .slice(0, 4)
    .map((e) => `${e.instancePath || "/"} ${e.message}`)
    .join("; ");
  offenders.push(`  ${entry.metadata.engineId}: ${why}`);
}
/**
 * A port must sit where artwork can reach it.
 *
 * A symbol is drawn inside its bbox, so a port declared on a face *corner*
 * can only be met by artwork that runs into the corner — which no symbol
 * does. The port marker then draws as a small circle beside the component
 * with nothing joining the two, and a reader cannot tell which component the
 * terminal belongs to.
 *
 * That is not hypothetical. Both current-controlled sources declared `p` and
 * `n` on the right face at offsets 1 and 59 of 60 — the two corners — while
 * their diamond drew leads out of the left and right vertices at mid-height.
 * Neither terminal touched the symbol. The comparator carried `vn` at offset
 * 40 of a 40-tall face, outside a triangle that ends at y=38, and the MESFET
 * put drain and source on the far corner of faces every other FET centres.
 *
 * Two units of margin, because a port exactly on a corner and a port one unit
 * from it are the same mistake.
 */
const CORNER_MARGIN = 2;
for (const entry of entries) {
  const meta = entry.metadata;
  const bbox = meta.symbol?.bbox;
  if (!bbox) continue;
  const [width, height] = bbox;
  for (const group of ["inputs", "outputs"]) {
    for (const port of meta.ports?.[group] ?? []) {
      if (port.side == null || port.offset == null) continue;
      const face = port.side === "left" || port.side === "right" ? height : width;
      if (port.offset <= CORNER_MARGIN || port.offset >= face - CORNER_MARGIN) {
        offenders.push(
          `  ${meta.engineId}: port '${port.id}' sits on a corner of the ${port.side} ` +
            `face (offset ${port.offset} of ${face}) — no artwork can reach it`,
        );
      }
    }
  }
}

if (offenders.length > 0) {
  console.error(
    `gen-engine-catalog: ${offenders.length} of ${entries.length} components do not satisfy ` +
      "the block-metadata contract:",
  );
  for (const line of offenders.slice(0, 20)) console.error(line);
  if (offenders.length > 20) console.error(`  ...and ${offenders.length - 20} more`);
  console.error(
    "\nThe engine owns which components exist; this schema owns how one is described. " +
      "Fix the engine's declaration, or change the schema if the contract itself should widen.",
  );
  process.exit(1);
}

const outputs = [
  [join(LIB, "engine-catalog.json"), entries],
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
