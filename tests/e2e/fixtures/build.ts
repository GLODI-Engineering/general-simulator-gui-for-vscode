/**
 * Playwright E2E harness.
 *
 * The suite drives the browser dev harness (`apps/frontend/index.html`), not
 * the extension host: VS Code's webviews cannot be driven headlessly, while
 * the harness mounts the same `App` against the same stores. Anything that
 * depends on the extension host itself is covered by the extension's own
 * integration suite (`apps/vscode-extension/src/integration/`).
 */

import { type Page, test as base } from "@playwright/test";

export interface BuildFixtures {
  appPage: Page;
}

/** Base URL for the dev harness (Vite dev server or preview). */
export const WEB_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export const test = base.extend<BuildFixtures>({
  appPage: async ({ page }, use) => {
    await page.goto(WEB_BASE_URL);
    await page.waitForSelector("[data-testid='app-shell'], main", { timeout: 15_000 });
    await use(page);
  },
});

export { expect } from "@playwright/test";
