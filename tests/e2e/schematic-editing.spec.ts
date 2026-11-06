/**
 * Editing a sheet: select, move, rotate, flip, copy, paste, delete.
 *
 * All of it through the pointer and the keyboard, so what is being tested
 * is the editor rather than the store actions underneath it.
 */

import { expect, test } from "./fixtures/build";
import { SchematicPage } from "./actions/schematic";

const RESISTOR = "physical_electrical.passive.resistor";

test.describe("selection", () => {
  test("clicking a component selects it, and a rotation reaches it", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const r = await sheet.add(RESISTOR, 0.4, 0.4);
    expect((await sheet.blockState(r)).rotation).toBe(0);

    await sheet.selectBlock(r);
    await sheet.rotateSelection("cw");

    expect((await sheet.blockState(r)).rotation).toBe(90);
  });

  test("a rubber band picks up everything inside it", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const a = await sheet.add(RESISTOR, 0.3, 0.3);
    const b = await sheet.add(RESISTOR, 0.6, 0.6);

    // Drag a box around both, from empty canvas.
    await sheet.marqueeSelect(
      await sheet.canvasPoint(0.1, 0.1),
      await sheet.canvasPoint(0.85, 0.85),
    );
    await sheet.deleteSelection();

    expect(await sheet.blockCount()).toBe(0);
    expect([a.id, b.id]).toHaveLength(2);
  });

  test("a rubber band leaves what is outside it alone", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    await sheet.add(RESISTOR, 0.2, 0.2);
    const outside = await sheet.add(RESISTOR, 0.85, 0.85);

    await sheet.marqueeSelect(
      await sheet.canvasPoint(0.05, 0.05),
      await sheet.canvasPoint(0.45, 0.45),
    );
    await sheet.deleteSelection();

    const left = await sheet.blocks();
    expect(left).toHaveLength(1);
    expect(left[0]?.id).toBe(outside.id);
  });
});

test.describe("transforms", () => {
  test("rotating four times comes back to where it started", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const r = await sheet.add(RESISTOR, 0.4, 0.4);
    await sheet.selectBlock(r);

    for (const expected of [90, 180, 270, 0]) {
      await sheet.rotateSelection("cw");
      expect((await sheet.blockState(r)).rotation).toBe(expected);
    }
  });

  test("rotating back undoes rotating forward", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const r = await sheet.add(RESISTOR, 0.4, 0.4);
    await sheet.selectBlock(r);

    await sheet.rotateSelection("cw");
    await sheet.rotateSelection("ccw");

    expect((await sheet.blockState(r)).rotation).toBe(0);
  });

  test("a rotated component's terminals rotate with it", async ({ appPage }) => {
    // A terminal that stays put while its symbol turns is a wire that
    // lands in the wrong place, and nothing on screen says so.
    const sheet = new SchematicPage(appPage);
    const r = await sheet.add(RESISTOR, 0.4, 0.4);
    const before = (await sheet.ports()).filter((p) => p.blockId === r.id);
    const spreadX = Math.abs((before[0]?.tip.x ?? 0) - (before[1]?.tip.x ?? 0));

    await sheet.selectBlock(r);
    await sheet.rotateSelection("cw");

    const after = (await sheet.ports()).filter((p) => p.blockId === r.id);
    const spreadY = Math.abs((after[0]?.tip.y ?? 0) - (after[1]?.tip.y ?? 0));
    expect(spreadX).toBeGreaterThan(40);
    expect(spreadY).toBeGreaterThan(40);
  });

  test("a wire survives rotating the component it lands on", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const a = await sheet.add(RESISTOR, 0.2, 0.3);
    const b = await sheet.add(RESISTOR, 0.7, 0.6);
    await sheet.wire({ block: a, port: "n" }, { block: b, port: "p" });

    await sheet.selectBlock(b);
    await sheet.rotateSelection("cw");

    const wires = await sheet.wires();
    expect(wires).toHaveLength(1);
    expect(wires[0]?.to.block).toBe(b.id);
    expect(wires[0]?.to.port).toBe("p");
  });
});

test.describe("clipboard", () => {
  test("copy and paste adds a second component", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const r = await sheet.add(RESISTOR, 0.35, 0.4);
    await sheet.selectBlock(r);

    await sheet.copy();
    await sheet.paste();

    const blocks = await sheet.blocks();
    expect(blocks).toHaveLength(2);
    expect(blocks[1]?.type).toBe(RESISTOR);
    // A paste on top of the original would be indistinguishable from
    // nothing having happened.
    expect(blocks[1]?.position).not.toEqual(blocks[0]?.position);
  });

  test("undo takes back a paste", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const r = await sheet.add(RESISTOR, 0.35, 0.4);
    await sheet.selectBlock(r);
    await sheet.copy();
    await sheet.paste();
    expect(await sheet.blockCount()).toBe(2);

    await sheet.undo();

    expect(await sheet.blockCount()).toBe(1);
  });
});

test.describe("deleting", () => {
  test("deleting a component takes its wires with it", async ({ appPage }) => {
    // A wire with one end on nothing is not a wire; leaving it behind
    // makes a sheet that cannot compile and does not look wrong.
    const sheet = new SchematicPage(appPage);
    const a = await sheet.add(RESISTOR, 0.25, 0.35);
    const b = await sheet.add(RESISTOR, 0.7, 0.6);
    await sheet.wire({ block: a, port: "n" }, { block: b, port: "p" });

    await sheet.selectBlock(b);
    await sheet.deleteSelection();

    expect(await sheet.blockCount()).toBe(1);
    expect(await sheet.wireCount()).toBe(0);
  });
});
