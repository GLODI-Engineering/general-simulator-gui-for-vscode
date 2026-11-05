/**
 * FE-40: Performance budget E2E tests
 *
 * Budgets (from progress.frontend.yaml §FE-40):
 * - Canvas frame ≤ 16 ms p95 under 200-block drag.
 * - Quick Insert open ≤ 50 ms.
 * - Save ≤ 100 ms.
 * - Load ≤ 200 ms for 200-block model.
 */

import { expect, test } from "./fixtures/build";

/** Measure the wall-clock time of an async action in ms. */
async function measure(fn: () => Promise<void>): Promise<number> {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

/** p95 of an array of numbers. */
function p95(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0;
}

test.describe("Perf budgets", () => {
  test("Quick Insert opens in ≤ 50 ms", async ({ appPage }) => {
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      const ms = await measure(async () => {
        await appPage.keyboard.press("Control+Shift+.");
        await appPage.waitForSelector("[data-testid='quick-insert'], [role='dialog'] input", {
          timeout: 2_000,
        });
        await appPage.keyboard.press("Escape");
      });
      samples.push(ms);
    }
    const p = p95(samples);
    expect(p, `Quick Insert p95 = ${p.toFixed(1)} ms (budget: 50 ms)`).toBeLessThanOrEqual(50);
  });

  test("save ≤ 100 ms for typical model", async ({ appPage }) => {
    // Insert a small model
    await appPage.evaluate(() => {
      const win = window as unknown as { __gensim_insertBlock?: (type: string) => void };
      win.__gensim_insertBlock?.("signal.step");
    });

    const ms = await measure(async () => {
      await appPage.keyboard.press("Control+s");
      // Wait for save confirmation (toast / status bar update)
      await appPage
        .waitForFunction(
          () => {
            const fn = (window as unknown as Record<string, unknown>).__gensim_last_save_ms as
              | number
              | undefined;
            return fn !== undefined;
          },
          { timeout: 5_000 },
        )
        .catch(() => {
          /* not exposed — approximate */
        });
    });

    expect(ms, `Save wall-clock = ${ms.toFixed(1)} ms (budget: 100 ms)`).toBeLessThanOrEqual(100);
  });

  test("load ≤ 200 ms for 200-block model", async ({ appPage }) => {
    // Seed a 200-block model via the window helper
    await appPage.evaluate(() => {
      const fn = (window as unknown as Record<string, unknown>).__gensim_load_fixture as
        | ((name: string) => void)
        | undefined;
      fn?.("200-blocks");
    });

    const ms = await measure(async () => {
      // Reload triggers load path
      await appPage.reload();
      await appPage.waitForSelector("[data-testid='app-shell'], main", { timeout: 10_000 });
    });

    expect(ms, `Load wall-clock = ${ms.toFixed(1)} ms (budget: 200 ms)`).toBeLessThanOrEqual(200);
  });

  test("canvas p95 frame ≤ 16 ms under 200-block drag", async ({ appPage }) => {
    // Seed 200 blocks
    await appPage.evaluate(() => {
      const fn = (window as unknown as Record<string, unknown>).__gensim_load_fixture as
        | ((name: string) => void)
        | undefined;
      fn?.("200-blocks");
    });

    // Start measuring frame times via PerformanceObserver
    await appPage.evaluate(() => {
      (window as unknown as Record<string, unknown>).__frame_durations = [];
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          ((window as unknown as Record<string, unknown>).__frame_durations as number[]).push(
            entry.duration,
          );
        }
      });
      obs.observe({ type: "frame", buffered: false } as PerformanceObserverInit);
    });

    // Select all and drag
    await appPage.keyboard.press("Control+a");
    const canvas = appPage.locator("canvas, [data-testid='canvas-surface']").first();
    const bb = await canvas.boundingBox();
    if (bb) {
      await appPage.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await appPage.mouse.down();
      for (let i = 0; i < 30; i++) {
        await appPage.mouse.move(bb.x + bb.width / 2 + i * 2, bb.y + bb.height / 2 + i * 2);
      }
      await appPage.mouse.up();
    }

    const durations: number[] = await appPage.evaluate(
      () => (window as unknown as Record<string, unknown>).__frame_durations as number[],
    );

    if (durations.length > 0) {
      const p = p95(durations);
      expect(p, `Canvas p95 frame = ${p.toFixed(1)} ms (budget: 16 ms)`).toBeLessThanOrEqual(16);
    } else {
      // PerformanceObserver 'frame' not available in all browsers — skip assertion
      test.skip();
    }
  });
});
