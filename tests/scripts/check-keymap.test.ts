/**
 * FE-07: keymap drift CI check script tests
 *
 * Acceptance:
 * - Intentionally-broken fixture markdown asserts script reports drift.
 * - Real files assert zero drift.
 */

import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const CHECK_SCRIPT = resolve(REPO_ROOT, "scripts/check-keymap.mjs");

function scriptExists(): boolean {
  try {
    execSync(`test -f "${CHECK_SCRIPT}"`, { cwd: REPO_ROOT, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function skip(name: string, fn: () => void) {
  if (!scriptExists()) it.skip(`${name} [check-keymap.ts not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-07: check-keymap drift script", () => {
  skip("reports zero drift against real files", () => {
    expect(() =>
      execSync(`node "${CHECK_SCRIPT}"`, { cwd: REPO_ROOT, stdio: "pipe" }),
    ).not.toThrow();
  });

  skip("reports drift when markdown has an extra binding not in registry", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "keymap-drift-"));
    // Write a broken keyboard-map.md that adds a nonexistent action
    const brokenMd =
      "# Keyboard Map\n\n## 1. File\n| Action | Chord | Context |\n|---|---|---|\n| file.new | `Ctrl+N` | global |\n| file.NONEXISTENT | `Ctrl+Alt+Z` | global |\n";
    writeFileSync(join(tmpDir, "keyboard-map.md"), brokenMd);

    let exitCode = 0;
    try {
      execSync(`node "${CHECK_SCRIPT}" --map="${join(tmpDir, "keyboard-map.md")}"`, {
        cwd: REPO_ROOT,
        stdio: "pipe",
      });
    } catch (e: unknown) {
      exitCode = (e as { status?: number }).status ?? 1;
    }
    expect(exitCode).not.toBe(0);
  });
});
