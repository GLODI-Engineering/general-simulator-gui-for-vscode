import { expect, test } from "@playwright/test";

/**
 * FE-56 e2e: wire cross-paradigm connection
 */

test.describe("FE-56: wire-cross-paradigm", () => {
  test("e2e wire-cross-paradigm: tooltip + insert converter creates 2 segments", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForSelector("[data-testid='app-shell'], main", { timeout: 15_000 });

    const hasHook = await page.evaluate(() => {
      const win = window as unknown as {
        __gensim_fe56_crossParadigmProbe?: () => {
          tooltip: string;
          committedWireCount: number;
          cursor: string;
        };
        __gensim_fe56_insertConverter?: () => {
          converterCount: number;
          newWireSegmentCount: number;
        };
      };
      return (
        typeof win.__gensim_fe56_crossParadigmProbe === "function" &&
        typeof win.__gensim_fe56_insertConverter === "function"
      );
    });

    test.skip(!hasHook, "FE-56 e2e hooks are not available in this build");

    const probe = await page.evaluate(() => {
      const win = window as unknown as {
        __gensim_fe56_crossParadigmProbe?: () => {
          tooltip: string;
          committedWireCount: number;
          cursor: string;
        };
      };
      return win.__gensim_fe56_crossParadigmProbe?.();
    });

    expect(probe?.tooltip.toLowerCase()).toContain("incompatible port kinds");
    expect(probe?.cursor).toBe("not-allowed");
    expect(probe?.committedWireCount).toBe(0);

    const insert = await page.evaluate(() => {
      const win = window as unknown as {
        __gensim_fe56_insertConverter?: () => {
          converterCount: number;
          newWireSegmentCount: number;
        };
      };
      return win.__gensim_fe56_insertConverter?.();
    });

    expect(insert?.converterCount).toBe(1);
    expect(insert?.newWireSegmentCount).toBe(2);
  });
});
