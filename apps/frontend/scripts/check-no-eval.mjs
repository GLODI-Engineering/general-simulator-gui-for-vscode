#!/usr/bin/env node
/**
 * Fails the build if the bundle can generate code at runtime.
 *
 * The VS Code webview serves this bundle under a CSP with no `'unsafe-eval'`.
 * A dependency that calls `new Function` or `eval` does not degrade there — it
 * throws at module-evaluation time and the webview renders *nothing*, with no
 * error anywhere outside the webview itself. That failure is invisible to
 * every unit test and to `vite build`, and it is what `'unsafe-eval'` was
 * originally added to paper over.
 *
 * So the constraint is checked where it is actually decided: the built output.
 * Source maps are skipped — they embed the original sources, including the
 * comments that discuss this very rule.
 *
 * Run: pnpm -F @gensim/frontend check:no-eval  (also runs as `postbuild`)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(__dirname, "..");
const DIST = join(FRONTEND_ROOT, "dist");

const FORBIDDEN = [
  { label: "new Function", pattern: /\bnew\s+Function\s*\(/g },
  { label: "eval(", pattern: /(^|[^.\w$])eval\s*\(/g },
];

function jsFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...jsFiles(path));
    } else if (entry.endsWith(".js")) {
      found.push(path);
    }
  }
  return found;
}

let distFiles;
try {
  distFiles = jsFiles(DIST);
} catch {
  console.error("check-no-eval: no dist/ to check - run the build first.");
  process.exit(1);
}

if (distFiles.length === 0) {
  console.error("check-no-eval: dist/ contains no JavaScript, which cannot be right.");
  process.exit(1);
}

let violations = 0;
for (const file of distFiles) {
  const source = readFileSync(file, "utf8");
  for (const { label, pattern } of FORBIDDEN) {
    pattern.lastIndex = 0;
    const hits = source.match(pattern);
    if (hits) {
      violations += hits.length;
      console.error(
        `check-no-eval: ${relative(FRONTEND_ROOT, file)} contains ${hits.length} \`${label}\` occurrence(s).`,
      );
    }
  }
}

if (violations > 0) {
  console.error(
    "check-no-eval: this bundle would render a blank VS Code webview under its CSP.\nPrecompile or replace whatever generates code at runtime - do not add 'unsafe-eval'.\nSee apps/vscode-extension/src/webview-html.ts.",
  );
  process.exit(1);
}

console.log(`check-no-eval: ${distFiles.length} bundled files, no runtime code generation.`);
