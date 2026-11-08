/**
 * Resizing a figure's axes by dragging the gap between them.
 *
 * The gap used to be `gap: 6px` — decoration, not a target. It is now a
 * real grid track, so the strip you see is exactly the strip you can grab.
 */

import { expect, test } from "./fixtures/build";

async function loadTwoAxes(page: Parameters<typeof test>[0] extends never ? never : any) {
  await page.evaluate(() => {
    const x: number[] = [];
    const a: number[] = [];
    const b: number[] = [];
    for (let k = 0; k < 200; k++) {
      const t = k / 1000;
      x.push(t);
      a.push(Math.sin(2 * Math.PI * 50 * t));
      b.push(Math.cos(2 * Math.PI * 50 * t));
    }
    (window as never as { __gensim_load_waveform: (d: unknown) => void }).__gensim_load_waveform({
      simId: "run-1",
      signals: [
        { name: "V(a)", unit: "V", quantity: "voltage", x, y: a },
        { name: "V(b)", unit: "V", quantity: "voltage", x, y: b },
      ],
      figures: [
        {
          name: "Results",
          rows: 2,
          cols: 1,
          axes: [
            { row: 0, col: 0, signals: ["V(a)"] },
            { row: 1, col: 0, signals: ["V(b)"] },
          ],
        },
      ],
    });
  });
  await page.waitForTimeout(2000);
}

test.describe("figure grid resize", () => {
  test("a row splitter exists between two stacked axes", async ({ appPage }) => {
    await loadTwoAxes(appPage);
    const splitter = appPage.locator(".figure-grid__splitter--row");
    await expect(splitter).toHaveCount(1);
    const box = await splitter.boundingBox();
    expect(box?.width ?? 0, "it spans the figure, so it is findable").toBeGreaterThan(100);
  });

  test("dragging it changes the heights, and keeps both axes", async ({ appPage }) => {
    await loadTwoAxes(appPage);
    const first = appPage.locator(".axes-container").first();
    const before = (await first.boundingBox())?.height ?? 0;
    expect(before).toBeGreaterThan(0);

    const splitter = appPage.locator(".figure-grid__splitter--row");
    const handle = (await splitter.boundingBox())!;
    await appPage.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await appPage.mouse.down();
    await appPage.mouse.move(handle.x + handle.width / 2, handle.y + 120, { steps: 10 });
    await appPage.mouse.up();
    await appPage.waitForTimeout(400);

    const after = (await first.boundingBox())?.height ?? 0;
    // How *much* it grows depends on the slack left by MIN_ROW in whatever
    // height the viewport gives the figure, so the assertion is that the
    // drag moved it, not by how many pixels.
    expect(after, "the top axes grew").toBeGreaterThan(before + 10);
    await expect(appPage.locator(".axes-container")).toHaveCount(2);
  });

  test("a drag past the edge stops rather than collapsing an axes", async ({ appPage }) => {
    await loadTwoAxes(appPage);
    const splitter = appPage.locator(".figure-grid__splitter--row");
    const handle = (await splitter.boundingBox())!;
    await appPage.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await appPage.mouse.down();
    await appPage.mouse.move(handle.x + handle.width / 2, handle.y + 5000, { steps: 10 });
    await appPage.mouse.up();
    await appPage.waitForTimeout(400);

    const second = appPage.locator(".axes-container").nth(1);
    const height = (await second.boundingBox())?.height ?? 0;
    expect(height, "the bottom axes survives").toBeGreaterThan(60);
  });
});
