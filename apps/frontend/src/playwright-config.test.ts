import { afterEach, describe, expect, it, vi } from "vitest";

import config from "../../../playwright.config";

/**
 * This guard exists so nobody quietly deletes an engine from the matrix.
 * It still does — but the matrix is now opt-in, because Playwright has no
 * Firefox build for every host (Ubuntu 26.04 among them) and a project that
 * cannot launch fails the entire run with "Executable doesn't exist", which
 * reads as a broken suite rather than a missing download.
 *
 * So both halves are asserted: the default run targets the engine that
 * matters most, and the other engines are still declared, one call away.
 */
async function projectsWith(value: string | undefined): Promise<string[]> {
  const previous = process.env.GSIM_E2E_BROWSERS;
  // `delete` and not an assignment: `process.env.X = undefined` stores the
  // *string* "undefined" in Node, so the variable would read as set and this
  // test would assert the wrong branch. Verified, not assumed.
  // biome-ignore lint/performance/noDelete: the only way to unset an env var
  if (value === undefined) delete process.env.GSIM_E2E_BROWSERS;
  else process.env.GSIM_E2E_BROWSERS = value;
  vi.resetModules();
  const fresh = (await import("../../../playwright.config")).default;
  // biome-ignore lint/performance/noDelete: as above — restoring an unset var
  if (previous === undefined) delete process.env.GSIM_E2E_BROWSERS;
  else process.env.GSIM_E2E_BROWSERS = previous;
  return fresh.projects?.map((project) => project.name as string) ?? [];
}

afterEach(() => {
  vi.resetModules();
});

describe("playwright matrix", () => {
  it("runs Chromium by default — the engine the VS Code webview is", async () => {
    expect(await projectsWith(undefined)).toEqual(["chromium"]);
  });

  it("still declares every engine, one env var away", async () => {
    expect(await projectsWith("all")).toEqual(["chromium", "firefox", "webkit"]);
  });

  it("treats any other value as the default rather than silently running nothing", async () => {
    expect(await projectsWith("firefox")).toEqual(["chromium"]);
  });

  it("points every project at the dev harness, not at a second host", () => {
    const baseUrls = (config.projects ?? []).map((project) => project.use?.baseURL);

    expect(new Set(baseUrls).size).toBe(1);
    expect(baseUrls[0]).toMatch(/^http:\/\/localhost:5173$|^http/);
  });
});
