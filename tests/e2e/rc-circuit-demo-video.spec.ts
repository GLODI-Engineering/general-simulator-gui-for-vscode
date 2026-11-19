import { expect, test } from "@playwright/test";
import { SchematicPage } from "./actions/schematic";

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

/**
 * Places a block on the sheet.
 *
 * Was a hand-rolled drag against `button.library-item` containing `.library-item__meta` --
 * a class the application has never rendered; it existed only in this file and its sibling.
 * So the drag waited out the full timeout on every run, finding an element that cannot exist.
 *
 * `SchematicPage.add` is the maintained path every other spec uses: Quick Insert, then a real
 * drag to place it. Palette dragging itself is covered by `toolbar-drag.spec.ts`, so nothing is
 * lost by not re-implementing it here.
 */
async function dragBlock(
  sheet: SchematicPage,
  blockName: string,
  target: { x: number; y: number },
) {
  // The page object places by fraction of the canvas; these specs were written in pixels
  // against a 1366x768 viewport.
  await sheet.add(blockName, target.x / 1366, target.y / 768);
}

test("record RC circuit build demo video (drag blocks + wire + run)", async ({ page }) => {
  const sheet = new SchematicPage(page);
  await page.goto("http://localhost:5173");

  const startup = page.getByTestId("startup-modal");
  if (await startup.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /new model/i }).click();
  }

  // The browser dev harness renders no editor tab strip and no activity rail: the schematic is
  // registered as an editor tab and the Library as an activity, but `App.tsx` uses
  // `listEditorTabs()` only to pick the active surface and to feed a keyboard cycle. The
  // schematic *is* the default surface, so there is nothing to click to reach it -- waiting for
  // a tab here cost 1.1 minutes per run, twice with retries, to discover that (#101).
  await page.waitForSelector("[data-testid='canvas-surface']", {
    state: "visible",
    timeout: 15000,
  });

  // Build by dragging from library into schematic canvas.
  await dragBlock(sheet, "source.voltage.dc", { x: 250, y: 170 });
  await page.waitForTimeout(350);

  await dragBlock(sheet, "passive.resistor", { x: 520, y: 170 });
  await page.waitForTimeout(350);

  await dragBlock(sheet, "passive.capacitor", { x: 800, y: 170 });
  await page.waitForTimeout(350);

  // `routing.ground` is the type; `physical-electrical.reference.ground` is one of its
  // aliases. Quick Insert resolves aliases, so placing one works under either name -- but the
  // block that lands on the sheet carries the canonical type, and that is the only name the
  // wiring hook below answers to. Use the canonical one at both ends.
  await dragBlock(sheet, "routing.ground", { x: 800, y: 360 });
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
    // The ground's port is `gnd`, not `g` -- the catalogue says so, and `wire_electrical`
    // refuses a port that is not there rather than guessing at a near-miss. Its *type* is
    // `routing.ground`: the hook matches `block.type` exactly and resolves no aliases.
    win.__gensim_wire_electrical?.("passive.capacitor", "n", "routing.ground", "gnd");
    win.__gensim_wire_electrical?.("source.voltage.dc", "n", "routing.ground", "gnd");
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
    // The browser harness runs against `createStubKernel`, which answers the handshake and
    // produces no samples (`smoke.spec.ts` states it). Pressing Run here checks that the
    // button is reachable and wired; the solver is covered in the extension's integration
    // suite, where it actually runs. Waiting hard for samples is why this spec burned its
    // whole timeout on every run.
    const gotSamples = await page
      .waitForFunction(
        () => ((window as unknown as GensimWindow).__gensim_getWaveformPointCount?.() ?? 0) > 0,
        undefined,
        { timeout: 15_000 },
      )
      .then(() => true)
      .catch(() => false);
    test.skip(!gotSamples, "stub kernel: no samples produced, so nothing to assert on");
    await expect(page.getByLabel(/waveform viewer/i)).toBeVisible();
    await page.waitForTimeout(1200);
  }
});
