import { defineConfig, devices } from "@playwright/test";
import { WEB_BASE_URL } from "./tests/e2e/fixtures/build";

/**
 * FE-40: Playwright configuration
 *
 * Drives the browser dev harness on localhost:5173 (Chromium, Firefox,
 * WebKit). The extension host has its own integration suite.
 * - Artifacts (traces, screenshots, downloaded .gsim files) uploaded on failure
 */

const baseURL = WEB_BASE_URL;

/**
 * Playwright ships no bundled Chromium for every distribution — on Ubuntu
 * 26.04 `playwright install chromium` refuses outright. Setting
 * PLAYWRIGHT_BROWSER_CHANNEL=chrome runs the suite against the browser
 * already on the machine instead.
 *
 * Opt-in via the environment rather than a default, so CI keeps using the
 * pinned bundled build: a suite that silently runs against whatever Chrome
 * a developer happens to have is a suite whose failures nobody can
 * reproduce.
 */
const channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;

function project(name: string, browser: keyof typeof devices, grepInvert?: RegExp) {
  return {
    name,
    use: {
      ...devices[browser],
      baseURL,
      ...(channel && name === "chromium" ? { channel } : {}),
    },
    grepInvert,
  };
}

export default defineConfig({
  // Keep root e2e specs and frontend-owned e2e specs discoverable.
  testDir: ".",
  testMatch: ["tests/e2e/**/*.spec.ts", "apps/frontend/tests/e2e/**/*.spec.ts"],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /* Retry once on CI to distinguish flakes from real regressions */
  retries: process.env.CI ? 1 : 0,

  /* Serial execution — perf budgets require an uncontended preview server */
  workers: 1,

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ...(process.env.CI ? [["github"] as [string]] : []),
  ],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  /**
   * Chromium by default; the others only when asked for.
   *
   * Chromium is not an arbitrary default — the VS Code webview this app
   * ships inside *is* Chromium, so it is the engine that matters most.
   *
   * Firefox and WebKit stay available but opt-in, because Playwright has no
   * Firefox build for every host it runs on (Ubuntu 26.04 among them) and a
   * project that cannot launch fails the whole run with "Executable doesn't
   * exist", which reads as a broken suite rather than a missing download.
   *
   *     GSIM_E2E_BROWSERS=all pnpm e2e
   *
   * Note what this cannot cover: the Tauri shell runs on WebKitGTK, which
   * Playwright's "webkit" is not, and `canvas/dnd.ts` documents real
   * drag-and-drop differences there. That gap is covered by neither project
   * and is worth knowing rather than assuming away.
   */
  projects:
    process.env.GSIM_E2E_BROWSERS === "all"
      ? [
          project("chromium", "Desktop Chrome"),
          project("firefox", "Desktop Firefox", /Perf budgets/),
          project("webkit", "Desktop Safari", /Perf budgets/),
        ]
      : [project("chromium", "Desktop Chrome")],

  /* Start the Vite preview server for the harness */
  webServer: {
    command:
      "pnpm --filter @gensim/frontend build && pnpm --filter @gensim/frontend preview --port 5173",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },

  outputDir: "test-results",
});
