/**
 * FE-40: E2E smoke test
 *
 * Scenario: Quick Insert × 3 (step, pid, scope) → wire × 2 → set kp=1.0 → Ctrl+T
 * → uPlot canvas shows >0 points. No console errors.
 */

import { expect, test } from "./fixtures/build";

test.describe("Smoke — web build", () => {
  test("quick-insert 3 blocks, wire, simulate — no console errors", async ({ appPage }) => {
    const errors: string[] = [];
    appPage.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // ── 1. Insert step / pid / scope via Quick Insert ─────────────────────
    for (const query of ["step", "pid", "scope"]) {
      await appPage.keyboard.press("Control+Shift+.");
      await appPage.getByPlaceholder(/search blocks/i).fill(query);
      await appPage.keyboard.press("Enter");
    }

    // ── 2. Wire and tune via deterministic e2e hooks ──────────────────────
    await appPage.evaluate(() => {
      const win = window as unknown as {
        __gensim_wire?: (fromType: string, toType: string) => void;
        __gensim_setParamOnFirst?: (
          type: string,
          key: string,
          value: string | number | boolean,
        ) => void;
        __gensim_run?: () => Promise<void>;
        __gensim_getWaveformPointCount?: () => number;
      };
      win.__gensim_wire?.("signal.step", "control.pid");
      win.__gensim_wire?.("control.pid", "sinks.scope");
      win.__gensim_setParamOnFirst?.("control.pid", "kp", 1.0);
    });

    // ── 3. Run simulation (Ctrl+T) ────────────────────────────────────────
    await appPage.keyboard.press("Control+t");

    // ── 4. Wait for waveform data ─────────────────────────────────────────
    await appPage.waitForFunction(() => {
      const win = window as unknown as { __gensim_getWaveformPointCount?: () => number };
      return (win.__gensim_getWaveformPointCount?.() ?? 0) > 0;
    });
    await expect(appPage.getByLabel(/waveform viewer/i)).toBeVisible({ timeout: 10_000 });

    // ── 5. No console errors ─────────────────────────────────────────────
    expect(errors).toHaveLength(0);
  });
});
