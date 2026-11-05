#!/usr/bin/env node
/**
 * Copy the built webview bundles into the extension for packaging.
 *
 * `webview-content.ts` probes two roots: `media/frontend` inside the
 * extension, and `../frontend/dist` for a source checkout. Only the first
 * survives `vsce package`, so the .vsix needs the tree copied in. The folder
 * is generated and git-ignored — this script is the only thing that writes it.
 */
import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "apps", "frontend", "dist");
const to = path.join(root, "apps", "vscode-extension", "media", "frontend");

try {
  await stat(path.join(from, "schematic.html"));
} catch {
  console.error(
    `bundle-webviews: ${from} has no schematic.html.\n` +
      "Run `pnpm --filter @gensim/frontend build` first.",
  );
  process.exit(1);
}

await rm(to, { recursive: true, force: true });
await cp(from, to, { recursive: true });
console.log(`bundle-webviews: ${path.relative(root, from)} -> ${path.relative(root, to)}`);
