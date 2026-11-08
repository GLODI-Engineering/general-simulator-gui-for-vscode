/**
 * Typing a value into a component: is it really saved, and really used?
 *
 * Both halves matter and they fail differently. A value can be accepted by
 * the field and never reach the document (which is what an engineering
 * suffix used to do — `Number("10u")` is NaN, so the commit never fired
 * while the box went on showing what was typed). Or it can reach the
 * document and not reach the netlist. Nothing was checking either.
 *
 * The netlist's number grammar is the solver's own
 * (`general-mna/src/expression.rs`): case-insensitive multipliers, `meg`
 * for 1e6, a trailing unit ignored. `M` is milli — mega is `MEG` — which in
 * power electronics is a factor of 10^9 waiting to happen.
 */

import { SchematicPage } from "./actions/schematic";
import { expect, test } from "./fixtures/build";

test.describe("entering a parameter", () => {
  test("a plain value is saved and reaches the netlist", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const r = await sheet.insertFromToolbar("Resistor");

    await sheet.setParam(r, "R", "2200");

    expect(await sheet.paramOf(r, "R"), "saved in the document").toBe(2200);
    const line = await sheet.netlistLineFor("R");
    expect(line, "a resistor line exists").not.toBeNull();
    expect(line, "the typed value reaches the netlist").toContain("2200");
  });

  test("an engineering suffix is saved as its real value", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const c = await sheet.insertFromToolbar("Capacitor");

    await sheet.setParam(c, "C", "10u");

    const saved = (await sheet.paramOf(c, "C")) as number;
    expect(typeof saved, "stored as a number, not the raw text").toBe("number");
    expect(saved).toBeCloseTo(1e-5, 18);
  });

  test("a suffix with a trailing unit is accepted, as SPICE does", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const l = await sheet.insertFromToolbar("Inductor");

    await sheet.setParam(l, "L", "3.6uH");

    expect((await sheet.paramOf(l, "L")) as number).toBeCloseTo(3.6e-6, 20);
  });

  test("k is a thousand, and lands in the netlist as one", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const r = await sheet.insertFromToolbar("Resistor");

    await sheet.setParam(r, "R", "2.2k");

    expect(await sheet.paramOf(r, "R")).toBe(2200);
    expect(await sheet.netlistLineFor("R")).toContain("2200");
  });

  /** The expensive one, pinned end to end rather than only in a unit test. */
  test("M is milli, and MEG is mega", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const r = await sheet.insertFromToolbar("Resistor");

    await sheet.setParam(r, "R", "1M");
    expect((await sheet.paramOf(r, "R")) as number).toBeCloseTo(1e-3, 12);

    await sheet.setParam(r, "R", "1MEG");
    expect(await sheet.paramOf(r, "R")).toBe(1e6);
  });

  test("a value the solver cannot read is refused, not stored", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const r = await sheet.insertFromToolbar("Resistor");
    await sheet.setParam(r, "R", "4700");
    expect(await sheet.paramOf(r, "R")).toBe(4700);

    await sheet.setParam(r, "R", "10x");

    expect(await sheet.paramOf(r, "R"), "the previous value survives").toBe(4700);
  });

  test("the netlist compiles without errors for a plain sheet", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const r = await sheet.insertFromToolbar("Resistor");
    await sheet.setParam(r, "R", "1k");

    const { errors } = await sheet.netlist();
    expect(errors.filter((e) => /parse|number|value/i.test(e))).toEqual([]);
  });
});
