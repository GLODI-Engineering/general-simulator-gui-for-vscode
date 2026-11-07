/**
 * Every component in the catalog: does it insert, and does it draw the
 * ports it says it has?
 *
 * A component whose symbol fails to render, or whose declared ports never
 * reach the canvas, is a component nobody can wire — and it looks fine in
 * the library until someone tries. Unit tests cover the renderer against
 * handwritten fixtures; this covers it against the whole catalog as
 * shipped.
 *
 * Failures are collected rather than thrown, so one run names every broken
 * component instead of the first one.
 *
 *   npx playwright test schematic-catalog-sweep --project=chromium
 *   SWEEP_LIMIT=40 npx playwright test schematic-catalog-sweep ...   # a taste
 *   SWEEP_FILTER=converter npx playwright test ...                   # one family
 */

import { allComponents } from "./actions/catalog";
import { SchematicPage } from "./actions/schematic";
import { expect, test } from "./fixtures/build";

const LIMIT = Number(process.env.SWEEP_LIMIT ?? "0");
const FILTER = process.env.SWEEP_FILTER ?? "";

function subjects() {
  let list = allComponents();
  if (FILTER) list = list.filter((c) => c.type.includes(FILTER));
  // Components with no ports at all (annotations, notes) have nothing to
  // check beyond inserting, and are kept for exactly that.
  if (LIMIT > 0) list = list.slice(0, LIMIT);
  return list;
}

interface Failure {
  type: string;
  problem: string;
}

test.describe("catalog sweep", () => {
  test("every component inserts and draws its ports", async ({ appPage }) => {
    const components = subjects();
    // Roughly a second and a half each, measured; the whole catalog is a
    // long run by design and is meant to be started deliberately.
    test.setTimeout(Math.max(120_000, components.length * 6_000));

    // A brisk probe: this sweep is about what renders, not about how
    // carefully it was clicked, and 492 components at the default pacing
    // is half an hour.
    const sheet = new SchematicPage(appPage, { settleMs: 10, jitterPx: 0 });
    const failures: Failure[] = [];

    for (const component of components) {
      try {
        await sheet.clearSheet();
        const block = await sheet.insertType(component.type);

        const nodeBox = await sheet.canvas.locator(`[data-block-id="${block.id}"]`).boundingBox();
        if (!nodeBox || nodeBox.width < 4 || nodeBox.height < 4) {
          failures.push({ type: component.type, problem: "symbol has no visible area" });
          continue;
        }

        const rendered = (await sheet.ports()).filter((p) => p.blockId === block.id);
        const declared = component.ports.map((p) => p.id);
        const missing = declared.filter((id) => !rendered.some((p) => p.portId === id));
        if (missing.length > 0) {
          failures.push({
            type: component.type,
            problem: `declares ports [${declared.join(", ")}] but did not draw [${missing.join(", ")}]`,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
        failures.push({ type: component.type, problem: message ?? "unknown" });
      }
    }

    const report = failures.map((f) => `  ${f.type}\n      ${f.problem}`).join("\n");
    expect(
      failures,
      `${failures.length} of ${components.length} components did not insert and draw cleanly:\n${report}`,
    ).toEqual([]);
  });
});
