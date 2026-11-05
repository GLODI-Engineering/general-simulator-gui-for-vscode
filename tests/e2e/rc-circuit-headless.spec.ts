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
  __gensim_getWaveformPointCount?: () => number;
};

async function buildRc(appPage: import("@playwright/test").Page) {
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
}

async function setAnalysis(
  appPage: import("@playwright/test").Page,
  analysis: "TRAN" | "AC" | "DC",
) {
  await appPage.evaluate((a) => {
    const graph = (window as unknown as { useGraphStore?: { getState: () => any } }).useGraphStore;
    if (!graph) return;
    const st = graph.getState();
    st.transact(`set ${a} analysis`, () => {
      if (a === "TRAN") {
        st.setSimulation({
          analyses: [{ id: "tran_rc", type: "TRAN", t_end: 0.005, t_step: 0.000005, uic: true }],
          default_analysis: "tran_rc",
        });
      } else if (a === "AC") {
        st.setSimulation({
          analyses: [
            { id: "ac_rc", type: "AC", sweep: "DEC", n_points: 100, f_start: 1, f_end: 1e6 },
          ],
          default_analysis: "ac_rc",
        });
      } else {
        st.setSimulation({
          analyses: [{ id: "dc_rc", type: "DC", source: "Vv1", start: 0, stop: 5, step: 0.1 }],
          default_analysis: "dc_rc",
        });
      }
    });
  }, analysis);
}

async function runAndCapture(
  appPage: import("@playwright/test").Page,
  analysis: "TRAN" | "AC" | "DC",
  outPath: string,
) {
  await setAnalysis(appPage, analysis);
  await appPage.getByRole("button", { name: /run simulation/i }).click();

  await appPage.waitForFunction(
    () => ((window as unknown as GensimWindow).__gensim_getWaveformPointCount?.() ?? 0) > 0,
    { timeout: 15_000 },
  );
  await expect(appPage.getByLabel(/waveform viewer/i)).toBeVisible();
  await appPage.screenshot({ path: outPath });
}

test("RC circuit headless frontend flow with screenshots (schematic + TRAN/AC/DC)", async ({
  appPage,
}) => {
  await buildRc(appPage);

  await appPage.screenshot({
    path: "docs/circuit_test/rc_circuit/frontend_schematic.png",
  });

  await runAndCapture(appPage, "TRAN", "docs/circuit_test/rc_circuit/frontend_tran.png");
  await runAndCapture(appPage, "AC", "docs/circuit_test/rc_circuit/frontend_ac.png");
  await runAndCapture(appPage, "DC", "docs/circuit_test/rc_circuit/frontend_dc.png");
});
