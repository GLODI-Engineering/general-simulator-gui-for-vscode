/**
 * Building a subcircuit the way a person does: select a few components,
 * press Ctrl+G, go inside, come back out.
 *
 * The part worth being careful about is the boundary. Grouping has to keep
 * wires that crossed the selection edge working, by synthesising inport and
 * outport blocks inside and rewiring the parent side to them. A grouping
 * that silently drops those wires leaves a sheet that looks right and no
 * longer connects.
 */

import { SchematicPage } from "./actions/schematic";
import { expect, test } from "./fixtures/build";

const RESISTOR = "physical_electrical.passive.resistor";
const CAPACITOR = "physical_electrical.passive.capacitor";

test.describe("grouping", () => {
  test("two selected components become one subsystem", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    await sheet.add(RESISTOR, 0.3, 0.35);
    await sheet.add(CAPACITOR, 0.55, 0.35);

    await sheet.marqueeSelect(
      await sheet.canvasPoint(0.1, 0.1),
      await sheet.canvasPoint(0.75, 0.65),
    );
    const subsystem = await sheet.groupSelection();

    const blocks = await sheet.blocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.id).toBe(subsystem.id);
  });

  test("grouping one component does nothing", async ({ appPage }) => {
    // The handler returns early below two blocks. Worth pinning: it is the
    // difference between "nothing happened" and "something happened that
    // you cannot see".
    const sheet = new SchematicPage(appPage);
    const r = await sheet.add(RESISTOR, 0.4, 0.4);
    await sheet.selectBlock(r);
    await sheet.probe.press("Control+G");
    await appPage.waitForTimeout(400);

    expect(await sheet.blockCount()).toBe(1);
    expect((await sheet.blocks())[0]?.type).toBe(RESISTOR);
  });

  test("a wire crossing the boundary survives the grouping", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const outside = await sheet.add(RESISTOR, 0.12, 0.25);
    const inA = await sheet.add(RESISTOR, 0.5, 0.3);
    const inB = await sheet.add(CAPACITOR, 0.78, 0.3);

    await sheet.wire({ block: outside, port: "n" }, { block: inA, port: "p" });
    await sheet.wire({ block: inA, port: "n" }, { block: inB, port: "p" });
    expect(await sheet.wireCount()).toBe(2);

    // Select only the two on the right.
    await sheet.marqueeSelect(
      await sheet.canvasPoint(0.33, 0.05),
      await sheet.canvasPoint(0.95, 0.6),
    );
    await sheet.groupSelection();

    const blocks = await sheet.blocks();
    expect(blocks).toHaveLength(2); // the outsider and the subsystem

    // The crossing wire is still there, now landing on the subsystem.
    const wires = await sheet.wires();
    expect(wires.length).toBeGreaterThanOrEqual(1);
    expect(wires.some((w) => w.from.block === outside.id || w.to.block === outside.id)).toBe(true);
  });
});

test.describe("navigating", () => {
  test("Enter goes inside and the contents are there", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    await sheet.add(RESISTOR, 0.3, 0.35);
    await sheet.add(CAPACITOR, 0.55, 0.35);
    await sheet.marqueeSelect(
      await sheet.canvasPoint(0.1, 0.1),
      await sheet.canvasPoint(0.75, 0.65),
    );
    const subsystem = await sheet.groupSelection();

    await sheet.selectBlock(subsystem);
    await sheet.enterSubsystem();

    // Inside, the two originals are on the canvas again. Asserted on what
    // is displayed, not on the saved document: Save writes the root sheet,
    // so `blocks()` still reports the root's contents from in here.
    const types = (await sheet.visibleBlocks()).map((b) => b.type);
    expect(types).toContain(RESISTOR);
    expect(types).toContain(CAPACITOR);
  });

  test("and coming back out shows the subsystem again", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    await sheet.add(RESISTOR, 0.3, 0.35);
    await sheet.add(CAPACITOR, 0.55, 0.35);
    await sheet.marqueeSelect(
      await sheet.canvasPoint(0.1, 0.1),
      await sheet.canvasPoint(0.75, 0.65),
    );
    const subsystem = await sheet.groupSelection();

    await sheet.selectBlock(subsystem);
    await sheet.enterSubsystem();
    expect((await sheet.visibleBlocks()).length).toBeGreaterThan(0);

    await sheet.leaveSubsystem();

    const outside = await sheet.visibleBlocks();
    expect(outside.map((b) => b.id)).toContain(subsystem.id);
  });
});
