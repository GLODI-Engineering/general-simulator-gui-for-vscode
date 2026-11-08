/**
 * Draw the SOGI-PLL and photograph it.
 *
 * Rendering quality is a correctness property here (AGENTS.md invariant 6)
 * and it is the one property no assertion checks: nothing fails because two
 * labels overlap, a wire leans three degrees off horizontal, or a symbol is
 * too pale to read. The only way to know is to produce the picture and look
 * at it — and this one is produced the way a user would produce it, by
 * drawing the circuit with the mouse.
 *
 *   PLAYWRIGHT_BROWSER_CHANNEL=chrome npx playwright test sogi-pll-render \
 *     --project=chromium
 */

import { SchematicPage } from "./actions/schematic";
import { test } from "./fixtures/build";
import { buildSogiPll } from "./scenarios/sogi-pll";

test.use({ viewport: { width: 1800, height: 1100 } });

test("photograph the SOGI-PLL as drawn", async ({ appPage }) => {
  test.setTimeout(420_000);
  const sheet = new SchematicPage(appPage, { settleMs: 40 });

  await buildSogiPll(sheet);
  await sheet.closeInspector();
  await sheet.focusCanvas();
  await sheet.fitView();

  await sheet.screenshot("render-out/sogi-pll-drawn-by-mouse.png");
});
