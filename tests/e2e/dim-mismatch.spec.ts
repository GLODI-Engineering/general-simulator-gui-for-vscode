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

    await appPage.getByRole("button", { name: "View options" }).click();
    await appPage.getByRole("button", { name: /signal dimensions/i }).click();

    await expect(appPage.getByTestId("canvas-dim-overlay")).toBeVisible();
    await expect(appPage.getByText("[3]").first()).toBeVisible();
  });
});
