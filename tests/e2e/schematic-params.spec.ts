/**
 * Editing a component's parameters through the inspector — and the part
 * that matters most, parameters that change the component's shape.
 *
 * `control.sum` and `control.product` generate their input ports from a
 * parameter. If editing it does not redraw the ports, a three-input adder
 * cannot be wired at all, and nothing on screen explains why.
 */

import { expect, test } from "./fixtures/build";
import { SchematicPage } from "./actions/schematic";

test.describe("the inspector", () => {
  test("shows a selected component's parameters", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const gain = await sheet.add("control.gain", 0.4, 0.4);

    await sheet.selectBlock(gain);
    await sheet.openInspector();

    // Keyed by what the inspector shows. `control.gain`'s parameter is
    // named `k` and labelled "Gain" — a test looking for "k" finds nothing
    // and concludes the parameter is missing.
    expect(Object.keys(await sheet.shownParams())).toContain("Gain");
  });

  test("a typed value reaches the saved document", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const gain = await sheet.add("control.gain", 0.4, 0.4);

    await sheet.setParam(gain, "k", 1.4142);

    expect(Number(await sheet.paramOf(gain, "k"))).toBeCloseTo(1.4142, 4);
  });
});

test.describe("parameters that change the ports", () => {
  test("a sum grows a third input when its signs say so", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const sum = await sheet.add("control.sum", 0.45, 0.45);

    const before = (await sheet.portsOf(sum)).filter((p) => p.direction === "in");
    expect(before).toHaveLength(2);

    await sheet.setParam(sum, "signs", "+++");

    const after = (await sheet.portsOf(sum)).filter((p) => p.direction === "in");
    expect(
      after,
      "a three-input adder that still draws two inputs cannot be wired",
    ).toHaveLength(3);
  });

  test("and the third input can be wired", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const sum = await sheet.add("control.sum", 0.6, 0.45);
    await sheet.setParam(sum, "signs", "+++");
    const source = await sheet.add("source.const", 0.15, 0.75);

    const third = await sheet.inputPort(sum, 2);
    const wire = await sheet.wire(
      { block: source, port: "out" },
      { block: sum, port: third },
    );
    expect(wire.to.port).toBe(third);
  });

  test("a product grows inputs with n_inputs", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const product = await sheet.add("control.product", 0.45, 0.45);
    const before = (await sheet.portsOf(product)).filter((p) => p.direction === "in").length;

    await sheet.setParam(product, "n_inputs", 3);

    const after = (await sheet.portsOf(product)).filter((p) => p.direction === "in").length;
    expect(after).toBeGreaterThan(before);
    expect(after).toBe(3);
  });
});
