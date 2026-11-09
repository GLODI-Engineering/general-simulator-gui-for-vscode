import { describe, expect, it } from "vitest";

import catalogManifest from "./catalog-manifest.json";
import engineCapabilities from "./engine-capabilities.json";
import { CATALOG_TO_ENGINE, KNOWN_DIVERGENCES, engineTypeOf } from "./engine-types";
import { supportsBlock } from "./simulator-compat";

const engineTypes = new Set(
  (engineCapabilities as { types: Array<{ type: string }> }).types.map((t) => t.type),
);

function catalogTypes(): Set<string> {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (key === "type" && typeof value === "string" && value.includes(".")) found.add(value);
        walk(value);
      }
    }
  };
  walk(catalogManifest);
  return found;
}

describe("the bridge points at things that exist on both sides", () => {
  it("every engine type named in the map is one the engine declares", () => {
    // This is the drift guard. If the engine renames or drops a type, the map keeps pointing
    // at a name nothing answers to and every block mapped through it silently goes back to
    // reporting unsupported — which is exactly the failure this whole change exists to end.
    const dangling = Object.entries(CATALOG_TO_ENGINE)
      .filter(([, engineType]) => !engineTypes.has(engineType))
      .map(([catalogType, engineType]) => `${catalogType} -> ${engineType}`);
    expect(dangling, "the engine no longer declares these").toEqual([]);
  });

  it("every catalogue type named in the map is one the catalogue has", () => {
    const catalog = catalogTypes();
    const dangling = Object.keys(CATALOG_TO_ENGINE).filter((t) => !catalog.has(t));
    expect(dangling, "the catalogue no longer has these").toEqual([]);
  });

  it("the divergence list names real types on both sides too", () => {
    const catalog = catalogTypes();
    for (const entry of KNOWN_DIVERGENCES) {
      expect(catalog.has(entry.catalogType), `catalogue lost ${entry.catalogType}`).toBe(true);
      expect(engineTypes.has(entry.engineType), `engine lost ${entry.engineType}`).toBe(true);
      expect(
        entry.differs.length,
        `${entry.catalogType} says nothing about what differs`,
      ).toBeGreaterThan(20);
    }
  });

  it("nothing is in both the map and the divergence list", () => {
    const mapped = new Set(Object.keys(CATALOG_TO_ENGINE));
    const both = KNOWN_DIVERGENCES.filter((d) => mapped.has(d.catalogType)).map(
      (d) => d.catalogType,
    );
    expect(both, "a type is either bridged or known-divergent, not both").toEqual([]);
  });
});

describe("supportsBlock answers from the engine's declaration", () => {
  it("says yes to a block the engine declares", () => {
    expect(supportsBlock("general-simulator", "physical-electrical.passive.resistor")).toBe(true);
    expect(supportsBlock("general-simulator", "physical-electrical.source.voltage_dc")).toBe(true);
    expect(supportsBlock("general-simulator", "signal-flow.math.gain")).toBe(true);
  });

  it("says yes to the pulse source that started all this", () => {
    // The report was "my simulator supports a pulse source and the GUI says it does not". It
    // was right about the engine and the engine was missing the type: a netlist could write
    // PULSE(...) on a V line, and no *block* compiled to one. gsim-core now has
    // `source.voltage.pulse`, and the catalogue entry already carried its seven fields.
    expect(supportsBlock("general-simulator", "physical-electrical.source.voltage_pulse")).toBe(
      true,
    );
  });

  it("says no to a block the engine genuinely cannot compile", () => {
    // A MOSFET has no type in the compile registry at all, so this "no" is the truth rather
    // than the collateral damage every block used to suffer.
    expect(supportsBlock("general-simulator", "physical-electrical.semiconductor.mosfet_n")).toBe(
      false,
    );
  });

  it("still says yes to everything when no target is chosen", () => {
    expect(supportsBlock("all", "physical-electrical.source.voltage_pulse")).toBe(true);
  });

  it("maps at least the common passives and sources, not zero of them", () => {
    // The regression this replaces: the old comparison matched none of the catalogue's types.
    const mapped = [...catalogTypes()].filter((t) => engineTypeOf(t) !== undefined);
    expect(mapped.length).toBeGreaterThanOrEqual(15);
  });
});
