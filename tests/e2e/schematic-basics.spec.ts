/**
 * The foundations, done the way a person does them: click, drag, release.
 *
 * Nothing here reaches for a test hook to perform an action. If a wire
 * appears it is because a drag from one terminal to another made the canvas
 * create one.
 */

import { expect, test } from "./fixtures/build";
import { SchematicPage } from "./actions/schematic";

test.describe("placing and moving", () => {
  test("a toolbar click puts a component on the sheet", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const resistor = await sheet.insertFromToolbar("Resistor");

    expect(resistor.type).toContain("resistor");
    await expect(resistor.locator).toBeVisible();
    expect(await sheet.blockCount()).toBe(1);
  });

  test("a dragged component ends up where it was dropped", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const resistor = await sheet.insertFromToolbar("Resistor");
    const before = (await sheet.blocks())[0]?.position as [number, number];

    await sheet.moveBlockBy(resistor, 220, 140);

    const after = (await sheet.blocks())[0]?.position as [number, number];
    expect(after[0]).toBeGreaterThan(before[0]);
    expect(after[1]).toBeGreaterThan(before[1]);
  });

  test("a component's terminals travel with it", async ({ appPage }) => {
    // The terminal is what a wire lands on, so a stale one is the
    // difference between a wire and a dangling drag.
    const sheet = new SchematicPage(appPage);
    const resistor = await sheet.insertFromToolbar("Resistor");
    const before = (await sheet.ports()).find((p) => p.portId === "p");

    await sheet.moveBlockBy(resistor, 180, 0);

    const after = (await sheet.ports()).find((p) => p.portId === "p");
    expect(after?.tip.x).toBeGreaterThan((before?.tip.x ?? 0) + 100);
  });
});

test.describe("wiring", () => {
  test("a drag between two terminals makes a wire", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const resistor = await sheet.insertFromToolbar("Resistor");
    const capacitor = await sheet.insertFromToolbar("Capacitor");
    // Apart, so their terminals are not on top of each other.
    await sheet.moveBlockBy(capacitor, 260, 160);

    const wire = await sheet.wire(
      { block: resistor, port: "n" },
      { block: capacitor, port: "p" },
    );

    expect(wire.from.block).toBe(resistor.id);
    expect(wire.to.block).toBe(capacitor.id);
    expect(wire.kind).toBe("physical-electrical");
  });

  test("a wire follows the component it is attached to", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const resistor = await sheet.insertFromToolbar("Resistor");
    const capacitor = await sheet.insertFromToolbar("Capacitor");
    await sheet.moveBlockBy(capacitor, 260, 160);
    await sheet.wire({ block: resistor, port: "n" }, { block: capacitor, port: "p" });

    await sheet.moveBlockBy(capacitor, 0, 180);

    // Still one wire, still attached to the same two ports.
    const wires = await sheet.wires();
    expect(wires).toHaveLength(1);
    expect(wires[0]?.to.block).toBe(capacitor.id);
  });
});

test.describe("undo", () => {
  test("takes back an insert", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    await sheet.insertFromToolbar("Resistor");
    expect(await sheet.blockCount()).toBe(1);

    await sheet.focusCanvas();
    await sheet.undo();

    expect(await sheet.blockCount()).toBe(0);
  });

  test("takes back a wire", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const resistor = await sheet.insertFromToolbar("Resistor");
    const capacitor = await sheet.insertFromToolbar("Capacitor");
    await sheet.moveBlockBy(capacitor, 260, 160);
    await sheet.wire({ block: resistor, port: "n" }, { block: capacitor, port: "p" });

    await sheet.focusCanvas();
    await sheet.undo();

    expect(await sheet.wireCount()).toBe(0);
    expect(await sheet.blockCount()).toBe(2);
  });
});
