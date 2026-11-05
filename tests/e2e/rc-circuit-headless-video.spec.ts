import { expect, test } from "./fixtures/build";

type GensimWindow = typeof globalThis & {
  __gensim_insertBlock?: (type: string) => void;
  __gensim_wire_electrical?: (
    fromType: string,
    fromPort: string,
    toType: string,
    toPort: string,
  ) => void;
  __gensim_setParamOnFirst?: (type: string, key: string, value: string | number | boolean) => void;
  __gensim_setActiveSimulator?: (id: string) => void;
  __gensim_setSimulationAnalysis?: (analysis: "TRAN" | "AC" | "DC") => void;
  __gensim_getWaveformPointCount?: () => number;
  __gensim_run?: () => Promise<void>;
};

test.use({ video: "on", viewport: { width: 1366, height: 768 } });

test("RC circuit demo video (build + TRAN/AC/DC)", async ({ appPage }) => {
  await appPage.waitForTimeout(700);

  await appPage.evaluate(() => {
    const win = window as unknown as GensimWindow;
    win.__gensim_insertBlock?.("source.voltage.dc");
    win.__gensim_insertBlock?.("passive.resistor");
    win.__gensim_insertBlock?.("passive.capacitor");

    win.__gensim_setParamOnFirst?.("source.voltage.dc", "V", 5.0);
    win.__gensim_setParamOnFirst?.("passive.resistor", "R", 1000.0);
    win.__gensim_setParamOnFirst?.("passive.capacitor", "C", 1e-6);

    win.__gensim_wire_electrical?.("source.voltage.dc", "p", "passive.resistor", "p");
    win.__gensim_wire_electrical?.("passive.resistor", "n", "passive.capacitor", "p");

    win.__gensim_setActiveSimulator?.("ngspice");
  });

  await appPage.waitForTimeout(1200);

  for (const analysis of ["TRAN", "AC", "DC"] as const) {
    await appPage.evaluate((a) => {
      const win = window as unknown as GensimWindow;
      win.__gensim_setSimulationAnalysis?.(a);
    }, analysis);

    await appPage.evaluate(async () => {
      const win = window as unknown as GensimWindow;
      await win.__gensim_run?.();
    });

    await appPage.waitForFunction(
      () => ((window as unknown as GensimWindow).__gensim_getWaveformPointCount?.() ?? 0) > 0,
      { timeout: 15000 },
    );

    await expect(appPage.getByLabel(/waveform viewer/i)).toBeVisible();
    await appPage.waitForTimeout(1500);
  }
});
