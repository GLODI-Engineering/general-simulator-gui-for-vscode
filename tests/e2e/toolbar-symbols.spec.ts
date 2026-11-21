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
  /** False when the button drew no symbol at all — its type is not in the catalogue. */
  rendered: boolean;
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
      const label = btn.getAttribute("aria-label") ?? "?";
      // A button whose type is not in the catalogue renders with no symbol at
      // all: `ComponentBtn` has no metadata, so it draws nothing and pushes a
      // toast if clicked. `continue` here is how two dead buttons (a BJT and a
      // MOSFET, left behind by the library prune in gsim-core#59) passed this
      // whole file -- they were skipped, and `>= 8` had the slack to absorb
      // them. Report them instead, so `everyButtonHasASymbol` can fail.
      if (!preview || !symbol) {
        out.push({
          label,
          previewW: 0,
          previewH: 0,
          symbolW: 0,
          symbolH: 0,
          overflow: 0,
          rendered: false,
        });
        continue;
      }
      const p = preview.getBoundingClientRect();
      const s = symbol.getBoundingClientRect();
      out.push({
        label,
        rendered: true,
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
  test("every button draws a symbol", async ({ appPage }) => {
    const items = await measure(appPage);
    // Not a magic number. `>= 8` stood here while the toolbar had ten buttons,
    // so when the library prune left two of them with no catalogue entry the
    // count still passed and `measure` skipped the corpses. The toolbar's own
    // button count is the only honest bound: whatever it offers, all of it has
    // to draw.
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.filter((i) => !i.rendered).map((i) => i.label),
      "toolbar buttons that insert a component the catalogue does not have",
    ).toEqual([]);
  });

  test("every symbol fits inside its button", async ({ appPage }) => {
    const items = (await measure(appPage)).filter((i) => i.rendered);
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      // One pixel of slack for sub-pixel layout rounding; the bug cut ten.
      expect(item.overflow, `${item.label} overflows its button`).toBeLessThanOrEqual(1);
    }
  });

  test("the tallest symbol is not singled out for clipping", async ({ appPage }) => {
    const items = (await measure(appPage)).filter((i) => i.rendered);
    expect(items.length).toBeGreaterThan(0);

    // This used to filter on /BJT|MOSFET/ and require two matches, because
    // those were the 120x120 symbols the #8 bug clipped — a constant scale
    // chosen for a 120x80 one took ten pixels off their top and bottom. Both
    // buttons are gone: they inserted `semi.bjt.npn` and `semi.mosfet.n`,
    // which gsim-core#59 removed from the library, so they had been dead
    // buttons rather than tall ones.
    //
    // Measured rather than named, so the test keeps its subject whatever the
    // toolbar holds. Every symbol on it now declares a 60x40 bbox, which makes
    // this a weak assertion today and a real one again the moment a symbol of
    // another shape is added — which is the point of not pinning it to two
    // component names.
    const tallest = items.reduce((a, b) => (b.symbolH > a.symbolH ? b : a));
    expect(tallest.overflow, `${tallest.label} is clipped`).toBeLessThanOrEqual(1);
    expect(tallest.symbolH, `${tallest.label} has collapsed instead of fitting`).toBeGreaterThan(8);
  });

  test("a symbol actually renders, rather than fitting by vanishing", async ({ appPage }) => {
    const items = (await measure(appPage)).filter((i) => i.rendered);
    for (const item of items) {
      expect(item.symbolW, `${item.label} has no width`).toBeGreaterThan(8);
      expect(item.symbolH, `${item.label} has no height`).toBeGreaterThan(8);
    }
  });
});
