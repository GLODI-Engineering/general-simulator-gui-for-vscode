import { describe, expect, it } from "vitest";

import { CATEGORY_ORDER } from "./LibraryActivity";
import manifest from "./engine-catalog.json";

/**
 * Every category the shipped catalogue uses must have a palette section.
 *
 * `LibraryActivity` renders the tree as `CATEGORY_ORDER.map(...)` and, inside each section,
 * keeps the entries whose `category` equals that section's. A component whose category is not
 * in the array therefore lands in no section at all — while staying searchable, insertable and
 * drawable. There is no error, no empty state, no gap in the tree: it is simply not there.
 *
 * Until now the only thing standing between the catalogue and that outcome was
 * `block-metadata.schema.json`, whose `category` enum is closed and is checked in *gsim-core*'s
 * CI against this repository's `main`. That stops an unknown category from shipping; it does
 * nothing about a known category this palette has never heard of. The enum is already the
 * larger list — it admits `source`, `element`, `opamp`, `routing`, `sensor` and `switch`, none
 * of which `CATEGORY_ORDER` has — so the two lists are free to drift for as long as no
 * component happens to use one of those words.
 *
 * gsim-core#60 is where that stopped being hypothetical: it groups the ideal diode and the
 * ideal switch under a new category, `ideal`, and without this test the pair would have
 * disappeared from the palette with every check in both repositories green.
 */

interface Entry {
  metadata: {
    name: string;
    category?: string | null;
    paradigm?: string;
  };
}

const entries = manifest as unknown as Entry[];

describe("every catalogue category has a palette section", () => {
  it("names a section for each category in use", () => {
    const sections = new Set<string>(CATEGORY_ORDER);
    const missing = [
      ...new Set(
        entries
          .map((e) => e.metadata.category)
          .filter((c): c is string => typeof c === "string" && c.length > 0)
          .filter((c) => !sections.has(c)),
      ),
    ].sort();

    expect(
      missing,
      "these categories are in the catalogue but have no section in CATEGORY_ORDER, " +
        "so their components render nowhere in the library tree",
    ).toEqual([]);
  });

  it("does not demand a category of the routing entries, which are grouped by paradigm", () => {
    // `routing.from` and `routing.goto` carry no category at all, and that is fine: the
    // routing section is built separately from `paradigm === "routing"` rather than from
    // `CATEGORY_ORDER`. Stated here so a future reader does not "fix" the null by inventing a
    // category for it, and so the test above is understood to skip them on purpose.
    const uncategorised = entries
      .filter((e) => !e.metadata.category)
      .map((e) => e.metadata.name)
      .sort();

    for (const name of uncategorised) {
      const entry = entries.find((e) => e.metadata.name === name);
      expect(
        entry?.metadata.paradigm,
        `${name} has no category, so it can only be reached by a paradigm-keyed section`,
      ).toBe("routing");
    }
  });

  it("gives every section a label, so none renders as undefined", () => {
    // `CATEGORY_LABELS` is typed `Record<(typeof CATEGORY_ORDER)[number], string>`, so a
    // missing label is a type error rather than a runtime one. This pins the pairing anyway:
    // the type only holds while both stay in the same file, and the cost of being wrong is a
    // section header reading "undefined".
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
  });
});
