/**
 * Toolbar component previews must fit their buttons.
 *
 * #8 was invisible to arithmetic. The catalog declares a resistor's bbox as
 * 60x40, which at the old `scale(0.47)` is 28x19 inside a 48x36 preview —
 * comfortably inside, on paper. Measured in a browser the rendered SVG is
 * 120x80, because a symbol draws its port stubs *outside* the declared
 * bbox, and the transistors are 120x120. Those became 56x38 and 56x56, so
 * `overflow: hidden` cut 4px from every side and 10px from the top and
 * bottom of the transistors.
 *
 * Hence a test that measures rather than computes: the only authority on
 * what a symbol occupies is the symbol, laid out.
 */

import { expect, test } from "./fixtures/build";

interface Geometry {
  label: string;
  previewW: number;
  previewH: number;
  symbolW: number;
  symbolH: number;
  overflow: number;
}

async function measure(page: Parameters<typeof test>[0] extends never ? never : any) {
  return (await page.evaluate(() => {
    const out: Geometry[] = [];
    for (const btn of document.querySelectorAll(".schematic-toolbar__component")) {
      const preview = btn.querySelector(".schematic-toolbar__component-preview");
      const symbol = btn.querySelector(".block-symbol");
      if (!preview || !symbol) continue;
      const p = preview.getBoundingClientRect();
      const s = symbol.getBoundingClientRect();
      out.push({
        label: btn.getAttribute("aria-label") ?? "?",
        previewW: Math.round(p.width),
        previewH: Math.round(p.height),
        symbolW: Math.round(s.width),
        symbolH: Math.round(s.height),
        // Positive on any side means the button is cutting the symbol off.
        overflow: Math.round(
          Math.max(s.right - p.right, p.left - s.left, s.bottom - p.bottom, p.top - s.top),
        ),
      });
    }
    return out;
  })) as Geometry[];
}

test.describe("toolbar component previews", () => {
  test("every symbol fits inside its button", async ({ appPage }) => {
    const items = await measure(appPage);
    expect(items.length).toBeGreaterThanOrEqual(8);

    for (const item of items) {
      // One pixel of slack for sub-pixel layout rounding; the bug cut ten.
      expect(item.overflow, `${item.label} overflows its button`).toBeLessThanOrEqual(1);
    }
  });

  test("the tall symbols are not singled out for clipping", async ({ appPage }) => {
    const items = await measure(appPage);
    const transistors = items.filter((i) => /BJT|MOSFET/.test(i.label));
    expect(transistors.length).toBeGreaterThanOrEqual(2);

    // These are the ones that lost their top and bottom: 120x120 of symbol
    // scaled by a constant chosen for a 120x80 one.
    for (const item of transistors) {
      expect(item.overflow, `${item.label} is clipped`).toBeLessThanOrEqual(1);
      expect(item.symbolH, `${item.label} has collapsed instead of fitting`).toBeGreaterThan(8);
    }
  });

  test("a symbol actually renders, rather than fitting by vanishing", async ({ appPage }) => {
    const items = await measure(appPage);
    for (const item of items) {
      expect(item.symbolW, `${item.label} has no width`).toBeGreaterThan(8);
      expect(item.symbolH, `${item.label} has no height`).toBeGreaterThan(8);
    }
  });
});
