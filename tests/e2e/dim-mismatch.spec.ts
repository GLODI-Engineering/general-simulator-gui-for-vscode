import { expect, test } from "./fixtures/build";

type GensimWindow = typeof globalThis & {
  __gensim_insertBlock?: (type: string) => void;
  __gensim_wire?: (fromType: string, toType: string) => void;
  __gensim_setParamOnFirst?: (type: string, key: string, value: unknown) => void;
};

test.describe("FE-65: signal dimension overlay", () => {
  test("e2e dim-mismatch: constant=[1,2,3] → math.gain(k=2) → scope shows '[3]' after View → Signal dimensions", async ({
    appPage,
  }) => {
    await appPage.evaluate(() => {
      const win = window as unknown as GensimWindow;
      win.__gensim_insertBlock?.("signal-flow.source.constant");
      win.__gensim_insertBlock?.("signal-flow.math.gain");
      win.__gensim_insertBlock?.("signal-flow.sink.scope");

      win.__gensim_setParamOnFirst?.("signal-flow.source.constant", "value", [1, 2, 3]);
      win.__gensim_setParamOnFirst?.("signal-flow.math.gain", "k", 2);

      win.__gensim_wire?.("signal-flow.source.constant", "signal-flow.math.gain");
      win.__gensim_wire?.("signal-flow.math.gain", "signal-flow.sink.scope");
    });

    // The overlay has no menu. This spec waited on `View options` → `Signal
    // dimensions`, a menu that was never built — so it spent 60 s timing out,
    // twice with the CI retry, and said nothing about FE-65 either way. The
    // affordance the application actually has is the Ctrl+Alt+D shortcut in
    // `shell/ShellDialogs.tsx`, which is what `dim-annotation.test.tsx` drives.
    //
    // With the real toggle the spec now fails in 12 s on the thing that is
    // genuinely wrong: `canvas-dim-overlay` never renders, because
    // `CanvasOverlay` returns null when the propagation pass yields nothing,
    // and it yields nothing because neither `source.const` nor `control.gain`
    // has a port signature. `dim-propagate.ts`'s `BUILTIN_PORT_SIGS` is keyed
    // by `signal-flow.*` names that no placed block carries. See
    // gsim-core#64 and the omni issue that tracks this spec.
    await appPage.keyboard.press("Control+Alt+KeyD");

    await expect(appPage.getByTestId("canvas-dim-overlay")).toBeVisible();
    await expect(appPage.getByText("[3]").first()).toBeVisible();
  });
});
