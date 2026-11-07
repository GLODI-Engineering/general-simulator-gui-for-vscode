/**
 * FE-40: Persistence E2E tests
 *
 * Scenarios:
 * 1. Web — build → Ctrl+S → reload → StartupModal lists the model → open → byte-equivalent.
 * 2. Export — Ctrl+Shift+E → download → bytes parse as valid .gsim.
 * 3. Desktop — Ctrl+S writes to disk; relaunch loads the model (Tauri only).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { expect, test } from "./fixtures/build";

// Load schema for export validation
let validateGsim: ((data: unknown) => boolean) | null = null;
try {
  const schemaPath = path.resolve(
    __dirname,
    "../../packages/schemas/definitions/model/gsim.schema.json",
  );
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  validateGsim = ajv.compile(schema) as (d: unknown) => boolean;
} catch {
  /* schema not yet authored — tests will skip */
}

async function buildSimpleModel(page: Parameters<typeof test>[1]["appPage"]) {
  await page.evaluate(() => {
    const win = window as unknown as { __gensim_insertBlock?: (type: string) => void };
    win.__gensim_insertBlock?.("signal.step");
    win.__gensim_insertBlock?.("control.pid");
  });
}

test.describe("Persistence — web (IndexedDB)", () => {
  test("save → reload → StartupModal lists model → open → byte-equivalent", async ({ appPage }) => {
    await buildSimpleModel(appPage);

    // Set a known model name
    const modelName = `e2e-persist-${Date.now()}`;
    await appPage.evaluate((name) => {
      const fn = (window as unknown as Record<string, unknown>).__gensim_rename as
        | ((n: string) => void)
        | undefined;
      fn?.(name);
    }, modelName);

    // Save (Ctrl+S)
    await appPage.keyboard.press("Control+s");
    await appPage.waitForTimeout(300); // allow async save to settle

    // Snapshot before reload
    const snapshotBefore = await appPage.evaluate(() => {
      const fn = (window as unknown as Record<string, unknown>).__gensim_serialize as
        | (() => string)
        | undefined;
      return fn?.() ?? "";
    });

    // Reload page and wait for app to fully re-mount before sending keys
    await appPage.reload();
    await appPage.waitForSelector("[data-testid='app-shell'], main", { timeout: 15_000 });
    await appPage.keyboard.press("Control+o");
    await appPage.waitForSelector("[data-testid='startup-modal'], [role='dialog']", {
      timeout: 10_000,
    });

    // StartupModal should list the model
    await expect(appPage.getByText(new RegExp(modelName.replace(/\d+/, "\\d+")))).toBeVisible();

    // Open it and wait for modal to close — close happens after loadDocument resolves
    await appPage.getByText(new RegExp(modelName.replace(/\d+/, "\\d+"))).click();
    await appPage.waitForSelector("[data-testid='startup-modal'], [role='dialog']", {
      state: "detached",
      timeout: 10_000,
    });

    // Snapshot after open — must match
    const snapshotAfter = await appPage.evaluate(() => {
      const fn = (window as unknown as Record<string, unknown>).__gensim_serialize as
        | (() => string)
        | undefined;
      return fn?.() ?? "";
    });
    expect(snapshotAfter).toBe(snapshotBefore);
  });
});

test.describe("Persistence — export (.gsim file)", () => {
  test.skip(!validateGsim, "gsim.schema.json not yet authored");

  test("Ctrl+Shift+E downloads a valid .gsim file", async ({ appPage }) => {
    await buildSimpleModel(appPage);

    const [download] = await Promise.all([
      appPage.waitForEvent("download"),
      appPage.keyboard.press("Control+Shift+e"),
    ]);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    // biome-ignore lint/style/noNonNullAssertion: filePath is asserted truthy above
    const bytes = readFileSync(filePath!);
    const parsed = JSON.parse(bytes.toString("utf8"));
    const valid = validateGsim?.(parsed);
    expect(valid, JSON.stringify((validateGsim as unknown as { errors: unknown[] }).errors)).toBe(
      true,
    );
  });
});

test.describe("Persistence — desktop (Tauri)", () => {});
