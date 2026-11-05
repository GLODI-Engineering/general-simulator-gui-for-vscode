import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";

import { type CatalogEntrySource, loadCatalog } from "../src/library/catalog-core.ts";
import type { BlockMetadata } from "../src/model/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const blocksRoot = resolve(repoRoot, "packages/blocks/src/blocks");
const outputPath = resolve(appRoot, "src/library/catalog-manifest.json");

function findMetadataFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...findMetadataFiles(fullPath));
      continue;
    }
    if (entry === "metadata.yaml") {
      results.push(fullPath);
    }
  }
  return results.sort((left, right) => left.localeCompare(right));
}

function canonicalize<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    ) as T;
  }
  return value;
}

function loadMetadataFiles(): CatalogEntrySource[] {
  return findMetadataFiles(blocksRoot).map((filePath) => {
    const parsed = yaml.load(readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`${filePath}: YAML root must be an object`);
    }
    return {
      filePath: relative(repoRoot, filePath),
      metadata: parsed as BlockMetadata,
    };
  });
}

const sources = loadMetadataFiles();
const catalog = loadCatalog(sources);
const manifest = Object.values(catalog)
  .map((metadata) => ({
    filePath:
      sources.find((source) => source.metadata.name === metadata.name)?.filePath ?? metadata.name,
    metadata,
  }))
  .sort((left, right) => left.metadata.name.localeCompare(right.metadata.name));

writeFileSync(outputPath, `${JSON.stringify(canonicalize(manifest), null, 2)}\n`, "utf8");
