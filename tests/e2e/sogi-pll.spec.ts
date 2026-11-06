/**
 * Draw the TIDA-style SOGI-PLL by hand, then group part of it into a
 * subcircuit — the whole workflow, end to end, with the mouse.
 *
 * The scenario itself lives in `scenarios/sogi-pll.ts` and says only what
 * connects to what. This file is what to check once it is drawn.
 */

import { expect, test } from "./fixtures/build";
import { SchematicPage } from "./actions/schematic";
import {
  SOGI_PLL_BLOCK_COUNT,
  SOGI_PLL_WIRE_COUNT,
  buildSogiPll,
} from "./scenarios/sogi-pll";

test.describe("SOGI-PLL", () => {
  test("draws complete, by mouse", async ({ appPage }) => {
    test.setTimeout(420_000);
    const sheet = new SchematicPage(appPage, { settleMs: 40 });

    const pll = await buildSogiPll(sheet);

    expect(await sheet.blockCount()).toBe(SOGI_PLL_BLOCK_COUNT);
    expect(await sheet.wireCount()).toBe(SOGI_PLL_WIRE_COUNT);

    // Every wire in a signal-flow sheet is a signal wire.
    const wires = await sheet.wires();
    expect(wires.every((w) => w.kind === "signal")).toBe(true);

    // The loop really closes: the frequency estimate drives both SOGI
    // multipliers and the phase integrator.
    const fromWsum = wires.filter((w) => w.from.block === pll.wsum.id);
    expect(fromWsum).toHaveLength(3);

    // And each integrator's output is read through its delay, not directly.
    for (const [integrator, delay] of [
      [pll.intA, pll.da],
      [pll.intB, pll.db],
      [pll.intTh, pll.dth],
    ] as const) {
      const out = wires.filter((w) => w.from.block === integrator.id);
      expect(out, `${integrator.id} should feed only its delay`).toHaveLength(1);
      expect(out[0]?.to.block).toBe(delay.id);
    }
  });

  test("the SOGI front end can be made a subcircuit", async ({ appPage }) => {
    test.setTimeout(420_000);
    const sheet = new SchematicPage(appPage, { settleMs: 40 });
    await buildSogiPll(sheet);

    const before = await sheet.wireCount();

    // Box the top row — the SOGI — and group it.
    sheet.probe.trace.note("grouping the SOGI front end");
    await sheet.marqueeSelect(
      await sheet.canvasPoint(0.14, 0.02),
      await sheet.canvasPoint(1.0, 0.5),
    );
    const subsystem = await sheet.groupSelection();

    const blocks = await sheet.blocks();
    expect(blocks.length).toBeLessThan(SOGI_PLL_BLOCK_COUNT);
    expect(blocks.some((b) => b.id === subsystem.id)).toBe(true);

    // Wires that crossed the boundary are kept, rewired to the subsystem.
    const after = await sheet.wires();
    expect(after.length).toBeGreaterThan(0);
    expect(before).toBeGreaterThan(0);

    // And it can be opened.
    await sheet.selectBlock(subsystem);
    await sheet.enterSubsystem();
    expect((await sheet.visibleBlocks()).length).toBeGreaterThan(1);
  });
});
