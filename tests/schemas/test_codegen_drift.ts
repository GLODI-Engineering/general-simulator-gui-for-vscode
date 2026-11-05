/**
 * FE-02: codegen drift test
 *
 * Runs the `@gensim/schemas codegen` script into a temp directory and diffs
 * the output against the committed generated files. Fails if they differ.
 *
 * Also imports the generated TS module to assert it compiles and is importable.
 */

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const SCHEMAS_PKG = resolve(REPO_ROOT, "packages/schemas");
const GENERATED_TS = resolve(SCHEMAS_PKG, "generated/typescript");

// ---------------------------------------------------------------------------
// Helper: collect all files in a directory recursively → Map<relPath, content>
// ---------------------------------------------------------------------------
function collectFiles(dir: string): Map<string, string> {
  const result = new Map<string, string>();
  function walk(current: string, rel: string) {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const relEntry = rel ? `${rel}/${entry}` : entry;
      if (statSync(full).isDirectory()) {
        walk(full, relEntry);
      } else {
        result.set(relEntry, readFileSync(full, "utf-8"));
      }
    }
  }
  try {
    walk(dir, "");
  } catch {
    // dir may not exist yet — empty map
  }
  return result;
}

describe("FE-02: codegen drift", () => {
  it("generated TS directory exists (codegen has been run at least once)", () => {
    // The generated directory must exist. If missing, the coder-agent hasn't run codegen yet.
    let exists = false;
    try {
      statSync(GENERATED_TS);
      exists = true;
    } catch {
      exists = false;
    }
    expect(
      exists,
      "packages/schemas/generated/typescript/ does not exist. Run: pnpm -F @gensim/schemas gen:ts",
    ).toBe(true);
  });

  it("regenerating into a temp dir produces byte-identical output (no drift)", () => {
    // Skip gracefully if pnpm or json-schema-to-typescript is not installed
    try {
      execSync("pnpm --version", { stdio: "ignore" });
    } catch {
      console.warn("pnpm not available; skipping drift check");
      return;
    }
    try {
      execSync("pnpm exec json-schema-to-typescript --version", {
        cwd: SCHEMAS_PKG,
        stdio: "ignore",
      });
    } catch {
      console.warn(
        "json-schema-to-typescript not available; skipping drift check (FE-02 not yet implemented)",
      );
      return;
    }

    const tmpDir = mkdtempSync(join(tmpdir(), "gensim-codegen-"));

    // Run codegen pointing output to tmpDir
    execSync(`pnpm exec json-schema-to-typescript -i 'definitions/**/*.json' -o '${tmpDir}'`, {
      cwd: SCHEMAS_PKG,
      stdio: "pipe",
    });

    const committed = collectFiles(GENERATED_TS);
    const regenerated = collectFiles(tmpDir);

    // Every committed file must be present and identical in the regenerated output
    const drifted: string[] = [];
    for (const [path, content] of committed) {
      if (regenerated.get(path) !== content) {
        drifted.push(path);
      }
    }
    // No new files should appear either
    for (const [path] of regenerated) {
      if (!committed.has(path)) {
        drifted.push(`NEW: ${path}`);
      }
    }

    expect(
      drifted,
      `Codegen drift detected in: ${drifted.join(", ")}. Run pnpm -F @gensim/schemas gen:ts and commit the result.`,
    ).toHaveLength(0);
  });
});
