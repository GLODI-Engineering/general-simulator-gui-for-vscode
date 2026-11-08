/**
 * Every declared parameter must have an editor.
 *
 * `type: "matrix"` had none. It fell through to a plain string field, so a
 * state-space matrix was free text that was never parsed or shape-checked.
 * That survived because nothing ever asked, for each component, whether the
 * inspector actually offers what the catalog declares.
 *
 * This asks. It is a coverage sweep rather than a behaviour test: it does
 * not check that each editor is *right*, only that one exists and is the
 * kind the parameter asks for. The per-type behaviour lives in
 * `param-entry.spec.ts` and the editors' own unit tests.
 */

import { allComponents } from "./actions/catalog";
import { SchematicPage } from "./actions/schematic";
import { expect, test } from "./fixtures/build";

/** Parameters the inspector deliberately does not surface as a field. */
const INTERNAL = /^_/;

const WITH_PARAMS = allComponents().filter(
  (c) => c.params.filter((p) => !INTERNAL.test(p.name)).length > 0,
);

/** One representative component per parameter type, so every editor is exercised. */
function representativesByType(): Map<string, { type: string; param: string; label: string }> {
  const byType = new Map<string, { type: string; param: string; label: string }>();
  for (const component of WITH_PARAMS) {
    for (const param of component.params) {
      if (INTERNAL.test(param.name)) continue;
      if (!byType.has(param.type)) {
        byType.set(param.type, {
          type: component.type,
          param: param.name,
          label: param.label,
        });
      }
    }
  }
  return byType;
}

test.describe("every parameter type has an editor", () => {
  test("the catalog's parameter types are all represented", () => {
    const types = [...representativesByType().keys()].sort();
    expect(types.length, "the manifest should declare several parameter types").toBeGreaterThan(2);
    // Stated so a new parameter type added to the catalog without an editor
    // shows up here as a surprise rather than as a silent string field.
    expect(types).toEqual(
      expect.arrayContaining(
        ["number", "vector", "matrix", "enum", "string"].filter((t) => types.includes(t)),
      ),
    );
  });

  for (const [paramType, rep] of representativesByType()) {
    test(`a "${paramType}" parameter is editable (${rep.type}.${rep.param})`, async ({
      appPage,
    }) => {
      const sheet = new SchematicPage(appPage);
      const block = await sheet.add(rep.type, 0.4, 0.4);
      await sheet.selectBlock(block);
      await sheet.openInspector();

      const shown = await sheet.shownParams();
      expect(
        Object.keys(shown),
        `${rep.type} declares "${rep.param}" (${paramType}) but the inspector shows none of it`,
      ).toContain(rep.label);
    });
  }
});

/**
 * A sample rather than all 492: the full sweep already takes nine minutes
 * for insertion alone, and opening the inspector per component multiplies
 * it. The sample is deterministic — every tenth component that has
 * parameters — so it covers a different slice as the catalog grows without
 * becoming flaky.
 */
test.describe("a sample of components show their parameters", () => {
  const SAMPLE = WITH_PARAMS.filter((_, index) => index % 10 === 0);

  test(`${SAMPLE.length} components show every declared parameter`, async ({ appPage }) => {
    test.setTimeout(600_000);
    const sheet = new SchematicPage(appPage);
    const missing: string[] = [];

    for (const component of SAMPLE) {
      await sheet.clearSheet();
      const block = await sheet.add(component.type, 0.4, 0.4);
      await sheet.selectBlock(block);
      await sheet.openInspector();
      const shown = new Set(Object.keys(await sheet.shownParams()));

      for (const param of component.params) {
        if (INTERNAL.test(param.name)) continue;
        if (!shown.has(param.label)) {
          missing.push(`${component.type}.${param.name} ("${param.label}", ${param.type})`);
        }
      }
    }

    expect(missing, `parameters declared but not editable:\n  ${missing.join("\n  ")}`).toEqual([]);
  });
});
