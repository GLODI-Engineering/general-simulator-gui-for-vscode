/**
 * Where a code block's ports come from.
 *
 * All five scripted blocks — C, Python (block and function), Octave (block
 * and function) — take their ports from `input_names` / `output_names`
 * parameters, declared variadic in the catalog with `count_from`. The code
 * itself is referenced by `path` (or `lib`) and is never read by the editor.
 *
 * That is not an oversight, it is the FFI contract. A C block exports
 * `cscript_output(void *state, const double *in, int in_len, double dt,
 * double *out, int out_len)` and a Python block defines
 * `output(state, t, dt, inputs)`. In neither case does the code declare how
 * many ports it has — it receives an array whose length the *schematic*
 * decided. So there is nothing in the source to synchronise *from*: adding
 * a line that reads `in[2]` does not create a third port, it reads past the
 * end of an array unless the schematic already declares three.
 *
 * These tests pin the direction that does exist — schematic to ports — so
 * the contract is written down and cannot drift unnoticed.
 */

import { SchematicPage } from "./actions/schematic";
import { expect, test } from "./fixtures/build";

const SCRIPTED = [
  "extensibility.cscript",
  "extensibility.pyblock",
  "extensibility.pyfunc",
  "extensibility.octfunc",
  "extensibility.octblock",
] as const;

test.describe("code block ports follow the schematic", () => {
  for (const type of SCRIPTED) {
    test(`${type} grows an input when input_names does`, async ({ appPage }) => {
      const sheet = new SchematicPage(appPage);
      const block = await sheet.add(type, 0.4, 0.4);

      const before = (await sheet.portsOf(block)).length;
      await sheet.setParam(block, "input_names", "a, b, c");
      const after = (await sheet.portsOf(block)).length;

      expect(after, "declaring three inputs must draw three input ports").toBeGreaterThan(before);
      expect(await sheet.paramOf(block, "input_names")).toBeTruthy();
    });
  }

  test("outputs follow output_names the same way", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const block = await sheet.add("extensibility.cscript", 0.4, 0.4);

    const before = (await sheet.portsOf(block)).length;
    await sheet.setParam(block, "output_names", "y1, y2, y3");
    const after = (await sheet.portsOf(block)).length;

    expect(after).toBeGreaterThan(before);
  });

  /**
   * The thing a person will reasonably expect and not get: editing the
   * referenced source file changes nothing here. Pinned so the absence is a
   * documented decision rather than a surprise.
   */
  test("the referenced source path is not read for ports", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const block = await sheet.add("extensibility.pyfunc", 0.4, 0.4);

    const before = (await sheet.portsOf(block)).length;
    await sheet.setParam(block, "path", "./some/other/model.py");
    const after = (await sheet.portsOf(block)).length;

    expect(after, "changing the source path must not change the ports").toBe(before);
  });
});

/**
 * The control that reads the source is *mounted*. Said as its own test
 * because this codebase has a habit of building things nothing renders —
 * the measurements bar, RunButton, deriveTopologyIssues, the waveform
 * render hook — and a unit test on the component proves only that the
 * component works.
 */
test.describe("reading ports from the source", () => {
  test("a scripted block with a path offers to read it", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const block = await sheet.add("extensibility.pyfunc", 0.4, 0.4);

    await sheet.setParam(block, "path", "./model.py");
    await sheet.selectBlock(block);
    await sheet.openInspector();

    await expect(appPage.getByRole("button", { name: /Read ports from source/ })).toBeVisible();
  });

  test("and says so when there is no workspace to read from", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const block = await sheet.add("extensibility.pyfunc", 0.4, 0.4);
    await sheet.setParam(block, "path", "./model.py");
    await sheet.selectBlock(block);
    await sheet.openInspector();

    await appPage.getByRole("button", { name: /Read ports from source/ }).click();

    // In the browser there is no extension host, which the control states
    // rather than failing silently or pretending it read something.
    await expect(appPage.getByText(/only be read inside the editor/)).toBeVisible();
  });

  test("a block with no source path does not offer it", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const block = await sheet.add("control.gain", 0.4, 0.4);
    await sheet.selectBlock(block);
    await sheet.openInspector();

    await expect(appPage.getByRole("button", { name: /Read ports from source/ })).toHaveCount(0);
  });
});
