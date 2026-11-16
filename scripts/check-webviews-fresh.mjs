#!/usr/bin/env node
/**
 * Refuse to package a .vsix around a stale webview bundle.
 *
 * The extension serves its UI from `media/frontend`, which is generated and git-ignored;
 * `bundle-webviews.mjs` is the only thing that writes it. The repo root's `package`
 * script does the whole sequence — build the frontend, copy it in, then `vsce package` —
 * but the extension's own `package` script is just the `vsce` call, and running *that*
 * directly packages whatever happens to be sitting in `media/frontend`.
 *
 * That is not a loud failure. It produces a perfectly valid .vsix serving a webview from
 * whenever someone last copied one in — a week earlier, in the case that prompted this
 * file, so the artifact was missing every change merged in between. Nothing in the
 * package output said so.
 *
 * So: compare timestamps and refuse. Cheap, and it turns a silent wrong artifact into a
 * message naming the command to run.
 */
import { stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const built = path.join(root, "apps", "frontend", "dist", "index.html");
const bundled = path.join(root, "apps", "vscode-extension", "media", "frontend", "index.html");

const hint =
  "Run `pnpm package` from the repository root, which builds the frontend, copies it in,\n" +
  "and then packages. Or, by hand:\n" +
  "  pnpm --filter @gensim/frontend build && pnpm bundle:webviews";

async function mtime(file) {
  try {
    return (await stat(file)).mtimeMs;
  } catch {
    return null;
  }
}

const builtAt = await mtime(built);
const bundledAt = await mtime(bundled);

if (bundledAt === null) {
  console.error(
    `check-webviews-fresh: the extension has no bundled webview at\n  ${bundled}\n\n${hint}`,
  );
  process.exit(1);
}

if (builtAt !== null && bundledAt < builtAt) {
  const ageMinutes = Math.round((builtAt - bundledAt) / 60_000);
  console.error(
    "check-webviews-fresh: the bundled webview is older than the built one by " +
      `${ageMinutes} minute(s).\n` +
      `  built:   ${built}\n` +
      `  bundled: ${bundled}\n\n` +
      `Packaging now would ship the older UI.\n\n${hint}`,
  );
  process.exit(1);
}

console.log("check-webviews-fresh: bundled webview is current.");
