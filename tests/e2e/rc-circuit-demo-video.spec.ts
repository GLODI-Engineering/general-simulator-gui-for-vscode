import { expect, test } from "@playwright/test";

type GensimWindow = typeof globalThis & {
  __gensim_wire_electrical?: (
    fromType: string,
    fromPort: string,
    toType: string,
    toPort: string,
  ) => void;
  __gensim_setParamOnFirst?: (type: string, key: string, value: string | number | boolean) => void;
  __gensim_setSimulationAnalysis?: (analysis: "TRAN" | "AC" | "DC") => void;
  __gensim_getWaveformPointCount?: () => number;
  __gensim_run?: () => Promise<void>;
};

test.use({ video: "on", viewport: { width: 1366, height: 768 } });

async function dragBlock(
  page: import("@playwright/test").Page,
  blockName: string,
  target: { x: number; y: number },
) {
  const item = page
    .locator("button.library-item")
    .filter({ has: page.locator(".library-item__meta", { hasText: blockName }) })
    .first();

  await item.scrollIntoViewIfNeeded();
  await item.dragTo(page.locator("[data-testid='canvas-surface']"), {
    targetPosition: target,
  });
}

test("record RC circuit build demo video (drag blocks + wire + run)", async ({ page }) => {
  await page.goto("http://localhost:5173");

  const startup = page.getByTestId("startup-modal");
  if (await startup.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /new model/i }).click();
  }

  await page.getByRole("tab", { name: /schematic/i }).click();
  await page.waitForSelector("[data-testid='canvas-surface']", {
    state: "visible",
    timeout: 15000,
  });

  // Build by dragging from library into schematic canvas.
  await dragBlock(page, "source.voltage.dc", { x: 250, y: 170 });
  await page.waitForTimeout(350);

  await dragBlock(page, "passive.resistor", { x: 520, y: 170 });
  await page.waitForTimeout(350);

  await dragBlock(page, "passive.capacitor", { x: 800, y: 170 });
  await page.waitForTimeout(350);

  await dragBlock(page, "physical-electrical.reference.ground", { x: 800, y: 360 });
  await page.waitForTimeout(350);

  // Set RC values in frontend model.
  await page.evaluate(() => {
    const win = window as unknown as GensimWindow;
    win.__gensim_setParamOnFirst?.("source.voltage.dc", "V", 5);
    win.__gensim_setParamOnFirst?.("passive.resistor", "R", 1000);
    win.__gensim_setParamOnFirst?.("passive.capacitor", "C", 1e-6);
  });

  // Wire the circuit (frontend helper hook currently used for deterministic E2E).
  await page.evaluate(() => {
    const win = window as unknown as GensimWindow;
    win.__gensim_wire_electrical?.("source.voltage.dc", "p", "passive.resistor", "p");
    win.__gensim_wire_electrical?.("passive.resistor", "n", "passive.capacitor", "p");
    win.__gensim_wire_electrical?.(
      "passive.capacitor",
      "n",
      "physical-electrical.reference.ground",
      "g",
    );
    win.__gensim_wire_electrical?.(
      "source.voltage.dc",
      "n",
      "physical-electrical.reference.ground",
      "g",
    );
  });
  await page.waitForTimeout(500);

  // Run TRAN, AC, DC from frontend side and let waveform render.
  for (const analysis of ["TRAN", "AC", "DC"] as const) {
    await page.evaluate((a) => {
      const win = window as unknown as GensimWindow;
      win.__gensim_setSimulationAnalysis?.(a);
    }, analysis);
    await page.evaluate(async () => {
      const win = window as unknown as GensimWindow;
      await win.__gensim_run?.();
    });
    await page.waitForFunction(
      () => ((window as unknown as GensimWindow).__gensim_getWaveformPointCount?.() ?? 0) > 0,
      { timeout: 15000 },
    );
    await expect(page.getByLabel(/waveform viewer/i)).toBeVisible();
    await page.waitForTimeout(1200);
  }
});
