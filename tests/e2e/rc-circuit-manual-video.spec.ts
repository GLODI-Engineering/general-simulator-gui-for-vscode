import { expect, test } from "./fixtures/build";

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
  useGraphStore?: {
    getState: () => {
      document: {
        model: {
          blocks: Array<{ type: string }>;
        };
      };
    };
  };
};

test.use({ video: "on", viewport: { width: 1366, height: 768 } });

async function dragBlock(
  appPage: import("@playwright/test").Page,
  blockName: string,
  target: { x: number; y: number },
) {
  const item = appPage
    .locator("button.library-item")
    .filter({ has: appPage.locator(".library-item__meta", { hasText: blockName }) })
    .first();

  await item.scrollIntoViewIfNeeded();
  await item.dragTo(appPage.locator("[data-testid='canvas-surface']").first(), {
    targetPosition: target,
  });
  await appPage.waitForTimeout(500);
}

async function gestureWire(
  appPage: import("@playwright/test").Page,
  fromType: string,
  fromPort: string,
  toType: string,
  toPort: string,
) {
  const src = appPage.locator(`[data-block-type='${fromType}']`).first();
  const dst = appPage.locator(`[data-block-type='${toType}']`).first();
  const srcBox = await src.boundingBox();
  const dstBox = await dst.boundingBox();
  if (!srcBox || !dstBox) {
    throw new Error(
      `Cannot wire ${fromType}:${fromPort} -> ${toType}:${toPort}: block not visible`,
    );
  }

  const sx = srcBox.x + srcBox.width / 2;
  const sy = srcBox.y + srcBox.height / 2;
  const dx = dstBox.x + dstBox.width / 2;
  const dy = dstBox.y + dstBox.height / 2;

  await appPage.mouse.move(sx, sy);
  await appPage.mouse.down();
  await appPage.mouse.move((sx + dx) / 2, (sy + dy) / 2, { steps: 18 });
  await appPage.mouse.move(dx, dy, { steps: 18 });
  await appPage.mouse.up();

  await appPage.evaluate(
    ({ ft, fp, tt, tp }) => {
      const win = window as unknown as GensimWindow;
      win.__gensim_wire_electrical?.(ft, fp, tt, tp);
    },
    { ft: fromType, fp: fromPort, tt: toType, tp: toPort },
  );

  await appPage.waitForTimeout(450);
}

test("manual-style RC video: drag components, wire, run", async ({ appPage }) => {
  const startup = appPage.getByTestId("startup-modal");
  if (await startup.isVisible().catch(() => false)) {
    await appPage.getByRole("button", { name: /new model/i }).click();
  }

  await appPage.getByRole("tab", { name: /schematic/i }).click();
  await appPage.getByTitle("Library").click();

  await appPage.evaluate(() => {
    for (const el of document.querySelectorAll("[data-testid='canvas-surface']")) {
      const node = el as HTMLElement;
      node.style.minHeight = "560px";
      node.style.height = "560px";
      node.style.display = "block";
    }
  });

  await expect(appPage.locator("[data-testid='canvas-surface']").first()).toBeVisible();

  await dragBlock(appPage, "source.voltage.dc", { x: 220, y: 170 });
  await dragBlock(appPage, "passive.resistor", { x: 500, y: 170 });
  await dragBlock(appPage, "passive.capacitor", { x: 780, y: 170 });
  await dragBlock(appPage, "signal_flow.source.ground", { x: 780, y: 350 });

  const blockTypes = await appPage
    .locator("[data-block-type]")
    .evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-block-type") ?? "").filter((value) => value.length > 0),
    );

  const srcType = blockTypes.find((t) => t.includes("voltage") && t.includes("source"));
  const rType = blockTypes.find((t) => t.includes("resistor"));
  const cType = blockTypes.find((t) => t.includes("capacitor"));

  if (!srcType || !rType || !cType) {
    throw new Error(`Unable to resolve inserted block types: ${JSON.stringify(blockTypes)}`);
  }

  await appPage.evaluate(
    ({ sourceType, resistorType, capacitorType }) => {
      const win = window as unknown as GensimWindow;
      win.__gensim_setParamOnFirst?.(sourceType, "V", 5);
      win.__gensim_setParamOnFirst?.(resistorType, "R", 1000);
      win.__gensim_setParamOnFirst?.(capacitorType, "C", 1e-6);
    },
    { sourceType: srcType, resistorType: rType, capacitorType: cType },
  );

  await gestureWire(appPage, srcType, "p", rType, "p");
  await gestureWire(appPage, rType, "n", cType, "p");

  for (const analysis of ["TRAN", "AC", "DC"] as const) {
    await appPage.evaluate((a) => {
      const win = window as unknown as GensimWindow;
      win.__gensim_setSimulationAnalysis?.(a);
    }, analysis);

    await appPage.getByRole("button", { name: /run simulation/i }).click();

    await appPage.waitForFunction(
      () => ((window as unknown as GensimWindow).__gensim_getWaveformPointCount?.() ?? 0) > 0,
      { timeout: 20000 },
    );
    await expect(appPage.getByLabel(/waveform viewer/i)).toBeVisible();
    await appPage.waitForTimeout(1200);
  }
});
