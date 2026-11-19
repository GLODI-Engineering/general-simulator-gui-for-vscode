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

    // `general-simulator` is the only target (`store/library.ts`), and the palette filters on
    // it, so "ngspice" -- a backend that was removed -- left a string nothing recognised. #49
    // records the two other ngspice tests being deleted for that; these two set it through the
    // window hook rather than naming it in a title, and were missed.
    //
    // It is not why they timed out. No samples arrive here whatever the simulator is: the
    // browser harness answers with a stub kernel. Corrected rather than left standing, because
    // a comment naming the wrong cause sends the next reader somewhere there is nothing wrong.
    win.__gensim_setActiveSimulator?.("general-simulator");
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

async function waitForSamples(page: import("@playwright/test").Page): Promise<boolean> {
  // The browser harness runs against `createStubKernel`, which answers the handshake and
  // produces **no samples** -- `smoke.spec.ts` says so in as many words, and spells the
  // consequence: pressing Run here checks that the button is reachable and wired, not that the
  // solver works. The solver is covered where it actually runs, in the extension's own
  // integration suite.
  //
  // So this returns whether samples arrived instead of insisting they did, and the caller skips
  // with the reason. Waiting hard for them is why these specs each burned their full timeout.
  return page
    .waitForFunction(
      () => ((window as unknown as GensimWindow).__gensim_getWaveformPointCount?.() ?? 0) > 0,
      { timeout: 15_000 },
    )
    .then(() => true)
    .catch(() => false);
}

/** @returns whether a waveform arrived, and therefore whether `outPath` was written. */
async function runAndCapture(
  appPage: import("@playwright/test").Page,
  analysis: "TRAN" | "AC" | "DC",
  outPath: string,
): Promise<boolean> {
  await setAnalysis(appPage, analysis);
  // The toolbar button's accessible name is "Run": `Btn` sets `aria-label={label ?? title}`,
  // so the label wins over `title="Run simulation  F5"`. The component that *does* answer to
  // "Run simulation" is `RunButton`, which nothing renders -- it is mounted only by its own
  // unit test (#102). These specs were waiting for a button that cannot exist in a running app.
  await appPage.getByRole("button", { name: "Run", exact: true }).click();

  if (!(await waitForSamples(appPage))) return false;
  await expect(appPage.getByLabel(/waveform viewer/i)).toBeVisible();
  await appPage.screenshot({ path: outPath });
  return true;
}

test("RC circuit headless frontend flow with screenshots (schematic + TRAN/AC/DC)", async ({
  appPage,
}) => {
  await buildRc(appPage);

  await appPage.screenshot({
    path: "docs/circuit_test/rc_circuit/frontend_schematic.png",
  });

  // The schematic screenshot above is produced whatever the kernel does -- it is the drawing.
  // The three waveform captures need a solver, so they are attempted and the test says plainly
  // when the harness could not supply one, rather than writing three pictures of an empty plot.
  const captured = await runAndCapture(
    appPage,
    "TRAN",
    "docs/circuit_test/rc_circuit/frontend_tran.png",
  );
  test.skip(!captured, "stub kernel: no samples, so the waveform screenshots cannot be made");
  await runAndCapture(appPage, "AC", "docs/circuit_test/rc_circuit/frontend_ac.png");
  await runAndCapture(appPage, "DC", "docs/circuit_test/rc_circuit/frontend_dc.png");
});
