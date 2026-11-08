/**
 * Dragging a component out of the toolbar onto the sheet.
 *
 * Every other spec inserts by *clicking* the toolbar, which is why #3 — the
 * toolbar offering no drag at all — survived a sweep of all 492 catalog
 * components. Click and drag are different code paths and only one of them
 * was ever driven.
 *
 * `dragTo` rather than the pointer helpers, on purpose: this is HTML5
 * drag-and-drop (`dragstart`/`dragover`/`drop` carrying a `DataTransfer`),
 * and raw pointer movement does not begin one. Playwright drives real drag
 * events through CDP, so this exercises the path a hand does.
 */

import { SchematicPage } from "./actions/schematic";
import { expect, test } from "./fixtures/build";

test.describe("toolbar drag", () => {
  test("dropping a toolbar component on the sheet creates it", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    expect(await sheet.blockCount()).toBe(0);

    const button = appPage.locator(".schematic-toolbar__component").first();
    await expect(button).toBeVisible();

    const pane = appPage.locator(".react-flow__pane");
    const box = (await pane.boundingBox())!;
    await button.dragTo(pane, {
      targetPosition: { x: Math.round(box.width * 0.5), y: Math.round(box.height * 0.5) },
      force: true,
    });

    expect(
      await sheet.blockCount(),
      "a component should exist after being dragged out of the toolbar",
    ).toBe(1);
  });

  test("the drop point decides where it lands", async ({ appPage }) => {
    const sheet = new SchematicPage(appPage);
    const pane = appPage.locator(".react-flow__pane");
    const box = (await pane.boundingBox())!;
    const button = appPage.locator(".schematic-toolbar__component").first();

    await button.dragTo(pane, {
      targetPosition: { x: Math.round(box.width * 0.25), y: Math.round(box.height * 0.3) },
      force: true,
    });
    await button.dragTo(pane, {
      targetPosition: { x: Math.round(box.width * 0.75), y: Math.round(box.height * 0.7) },
      force: true,
    });

    const blocks = await sheet.blocks();
    expect(blocks).toHaveLength(2);
    const [a, b] = blocks as Array<{ position: [number, number] }>;
    // Two drops at different points must not stack on one spot — which is
    // exactly what clicking the toolbar does.
    expect(
      Math.abs(a.position[0] - b.position[0]) + Math.abs(a.position[1] - b.position[1]),
    ).toBeGreaterThan(50);
  });
});
