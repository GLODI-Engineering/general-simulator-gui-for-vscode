/**
 * FE-24: QuickInsert palette tests
 *
 * Acceptance:
 * - Search ranking: recently-used → prefix → substring → fuzzy.
 * - Enter inserts the highlighted block; Esc cancels.
 * - Recency boost moves blocks up on subsequent invocations.
 */

import { describe, expect, it } from "vitest";

let searchCatalog: Function | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./search");
  searchCatalog = mod.searchCatalog ?? mod.rankSearch ?? mod.search ?? mod.default;
  if (searchCatalog !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

// searchCatalog(entries, query, recent) → SearchResult[] where item = { entry: BlockMetadata, score: number }
type R = { entry: { name: string }; score: number };

const CATALOG = [
  { name: "signal.constant", label: "Constant", aliases: [], tags: [] },
  { name: "control.gain", label: "Gain", aliases: [], tags: [] },
  {
    name: "control.pid",
    label: "PID Controller",
    aliases: ["Proportional-Integral-Derivative"],
    tags: [],
  },
  { name: "control.integrator", label: "Integrator", aliases: [], tags: [] },
  { name: "sinks.scope", label: "Scope", aliases: [], tags: ["display"] },
];

describe("FE-24: search ranking", () => {
  skip("prefix match ranks above substring match", () => {
    const results: R[] = searchCatalog?.(CATALOG, "gain", []);
    const gainIdx = results.findIndex((r) => r.entry.name === "control.gain");
    const integIdx = results.findIndex((r) => r.entry.name === "control.integrator");
    // "gain" is a prefix of "Gain" (label); integrator doesn't match "gain"
    expect(gainIdx).toBeGreaterThanOrEqual(0);
    expect(gainIdx).toBeLessThan(integIdx === -1 ? 999 : integIdx);
  });

  skip("recently-used block ranks above non-recent", () => {
    const recent = ["control.pid"];
    const results: R[] = searchCatalog?.(CATALOG, "c", recent);
    const pidIdx = results.findIndex((r) => r.entry.name === "control.pid");
    const gainIdx = results.findIndex((r) => r.entry.name === "control.gain");
    expect(pidIdx).toBeGreaterThanOrEqual(0);
    expect(pidIdx).toBeLessThan(gainIdx);
  });

  skip("alias match surfaces the block", () => {
    const results: R[] = searchCatalog?.(CATALOG, "Proportional", []);
    expect(results.some((r) => r.entry.name === "control.pid")).toBe(true);
  });

  skip("empty query returns all catalog entries", () => {
    const results: R[] = searchCatalog?.(CATALOG, "", []);
    expect(results.length).toBe(CATALOG.length);
  });
});

describe("an exact match wins", () => {
  const entry = (name: string, label: string, aliases: string[] = []) =>
    ({ name, label, aliases, tags: [] }) as unknown as BlockMetadata;

  /**
   * The case this exists for: a family's merged entry carries every
   * variant's name in its aliases, so searching for a variant's full name
   * matched both it and the family. They tied, and the tie broke
   * alphabetically — typing "physical_electrical.reference.ground"
   * selected "routing.ground".
   */
  it("prefers the component whose own name was typed over a family that lists it", () => {
    const family = entry("routing.ground", "Ground", [
      "physical_electrical.reference.ground",
      "signal_flow.source.ground",
    ]);
    const exact = entry("physical_electrical.reference.ground", "Ground Reference");

    const results = searchCatalog([family, exact], "physical_electrical.reference.ground", []);
    expect(results[0]?.entry.name).toBe("physical_electrical.reference.ground");
  });

  it("beats a recently used block that merely contains the text", () => {
    // The recency bonus tops out at 40; an exact match must clear it.
    const recentlyUsed = entry("routing.ground.extra", "Ground Extra");
    const exact = entry("routing.ground", "Ground");
    const results = searchCatalog([recentlyUsed, exact], "routing.ground", [
      "routing.ground.extra",
    ]);
    expect(results[0]?.entry.name).toBe("routing.ground");
  });

  it("is not displaced by a recently used block that lists it as an alias", () => {
    /*
     * The real case, and one that only appears in a sequence: searching for
     * "passive.switch.voltage" inserted "passive.switch.ideal" — whose
     * metadata lists the voltage switch's type name among its aliases —
     * but only after the ideal switch had been inserted once. An exact
     * alias match plus the recency bonus (100 + 40) outran an exact name
     * match (120).
     */
    const ideal = entry("passive.switch.ideal", "Ideal Switch", ["passive.switch.voltage"]);
    const voltage = entry("passive.switch.voltage", "Voltage-Controlled Switch");

    const results = searchCatalog([ideal, voltage], "passive.switch.voltage", [
      "passive.switch.ideal",
    ]);
    expect(results[0]?.entry.name).toBe("passive.switch.voltage");
  });

  it("still prefers a name match to a label match", () => {
    const byLabel = entry("other.thing", "control.gain");
    const byName = entry("control.gain", "Gain");
    const results = searchCatalog([byLabel, byName], "control.gain", []);
    expect(results[0]?.entry.name).toBe("control.gain");
  });

  it("leaves partial matching alone", () => {
    const a = entry("passive.resistor", "Resistor");
    const b = entry("physical_electrical.passive.resistor", "Electrical Resistor");
    const results = searchCatalog([a, b], "resistor", []);
    expect(results.map((r) => r.entry.name).sort()).toEqual(
      ["passive.resistor", "physical_electrical.passive.resistor"].sort(),
    );
  });
});
