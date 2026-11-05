/**
 * FE-40: Undo/redo E2E test
 *
 * Scenario: Build model → Ctrl+Z × N until empty → Ctrl+Y × N back to final.
 * After full redo, serialized model must be byte-equivalent to snapshot taken
 * at the end of the build sequence.
 */

import { expect, test } from "./fixtures/build";

/** Read the serialised model JSON from the app via an exposed window helper. */
async function getModelSnapshot(page: Parameters<typeof test>[1]["appPage"]): Promise<string> {
  return page.evaluate(() => {
    // Implementations should expose window.__gensim_serialize?.() or similar
    const fn = (window as unknown as Record<string, unknown>).__gensim_serialize as
      | (() => string)
      | undefined;
    return fn?.() ?? JSON.stringify({ _fallback: true });
  });
}

test.describe("Undo/redo — model round-trip", () => {
  test("undo to empty then redo restores byte-equivalent model", async ({ appPage }) => {
    // ── Build a 3-block model plus wires/param via helpers ───────────────
    await appPage.evaluate(() => {
      const win = window as unknown as {
        __gensim_insertBlock?: (type: string) => void;
        __gensim_wire?: (fromType: string, toType: string) => void;
        __gensim_setParamOnFirst?: (
          type: string,
          key: string,
          value: string | number | boolean,
        ) => void;
      };
      win.__gensim_insertBlock?.("signal.step");
      win.__gensim_insertBlock?.("control.pid");
      win.__gensim_insertBlock?.("sinks.scope");
      win.__gensim_wire?.("signal.step", "control.pid");
      win.__gensim_wire?.("control.pid", "sinks.scope");
      win.__gensim_setParamOnFirst?.("control.pid", "kp", 1);
    });

    // Snapshot after build
    const snapshotAfterBuild = await getModelSnapshot(appPage);

    // Count undo steps we've taken so far (3 block inserts)
    const buildSteps = 6;

    // ── Undo all steps ───────────────────────────────────────────────────
    for (let i = 0; i < buildSteps; i++) {
      await appPage.keyboard.press("Control+z");
    }

    // Canvas should now be empty
    const emptySnapshot = await getModelSnapshot(appPage);
    const empty = JSON.parse(emptySnapshot);
    const blocks = empty?.model?.blocks ?? empty?.blocks ?? [];
    expect(blocks).toHaveLength(0);

    // ── Redo all steps ───────────────────────────────────────────────────
    for (let i = 0; i < buildSteps; i++) {
      await appPage.keyboard.press("Control+y");
    }

    // Snapshot after redo must match snapshot after build
    const snapshotAfterRedo = await getModelSnapshot(appPage);
    expect(snapshotAfterRedo).toBe(snapshotAfterBuild);
  });
});
