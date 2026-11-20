import { describe, expect, it } from "vitest";

import { loadCatalogFromManifest } from "./catalog";
import { componentFor, engineComponents, engineTypeOf, isCompilable } from "./engine-types";
import { supportsBlock } from "./simulator-compat";

describe("the catalogue comes from the engine", () => {
  it("every component the engine declares is loadable by the front end", () => {
    // `loadCatalog` validates each component against the block-metadata schema and throws on
    // the first bad one, so this failing means the engine is serving something the front end
    // cannot render — the migration broke two components this way, pointing `main_param` and
    // a port's `count_from` at parameters that were no longer there.
    const catalog = loadCatalogFromManifest();
    expect(Object.keys(catalog).length).toBeGreaterThan(200);
  });

  it("says what each component compiles to, without a map kept here", () => {
    expect(engineTypeOf("passive.resistor")).toBe("passive.resistor");
    expect(engineTypeOf("source.voltage.pulse")).toBe("source.voltage.pulse");
    // A name the engine has no model for is not in the catalogue at all since gsim-core#59,
    // so it compiles to nothing for the same reason `no.such.component` does.
    expect(engineTypeOf("physical-electrical.semiconductor.mosfet_n")).toBeUndefined();
    expect(engineTypeOf("no.such.component")).toBeUndefined();
  });

  it("resolves a component under every spelling it answers to", () => {
    // The library merged duplicate descriptions of the same device under the engine's name.
    // Documents on disk carry the older spellings, so these must keep resolving.
    for (const spelling of [
      "passive.resistor",
      "physical-electrical.passive.resistor",
      "physical_electrical.passive.resistor",
      "resistor",
      "R",
    ]) {
      expect(componentFor(spelling)?.engineId, `${spelling} did not resolve`).toBe(
        "passive.resistor",
      );
    }
  });

  it("serves only what it can compile", () => {
    // Reversed by gsim-core#59. This used to assert the opposite -- that the catalogue carries
    // every component the library knows and *marks* the ones nothing can compile, so a palette
    // could show them and say honestly "this engine has no model for it". 164 of 240 components
    // were in that state, which made the mark the normal case rather than the exception, and
    // the library now holds exactly what the engine emits. There is no component left to mark.
    //
    // So a palette entry is a promise, and a name the engine never had is *absent* rather than
    // present-and-false.
    const components = engineComponents();
    expect(components.length).toBeGreaterThanOrEqual(60);
    expect(components.filter((c) => !c.compilable).map((c) => c.id)).toEqual([]);
    expect(componentFor("physical-electrical.semiconductor.mosfet_n")).toBeUndefined();
    expect(isCompilable("physical-electrical.semiconductor.mosfet_n")).toBe(false);
  });
});

describe("supportsBlock answers from the engine's declaration", () => {
  it("says yes to a block the engine compiles, under either spelling", () => {
    for (const spelling of ["passive.resistor", "physical-electrical.passive.resistor"]) {
      expect(supportsBlock("general-simulator", spelling), spelling).toBe(true);
    }
    expect(supportsBlock("general-simulator", "control.gain")).toBe(true);
  });

  it("says yes to the pulse source that started all this", () => {
    // The report was "my simulator supports a pulse source and the GUI says it does not". It
    // was right about the engine, and the engine was missing the type: a netlist could write
    // PULSE(...) on a V line and no block compiled to one. gsim-core has the type now.
    expect(supportsBlock("general-simulator", "source.voltage.pulse")).toBe(true);
    expect(supportsBlock("general-simulator", "physical-electrical.source.voltage_pulse")).toBe(
      true,
    );
  });

  it("says no to a block the engine genuinely cannot compile", () => {
    // A MOSFET has no type in the compile registry, so this "no" is the truth rather than the
    // collateral damage every block used to suffer.
    expect(supportsBlock("general-simulator", "physical-electrical.semiconductor.mosfet_n")).toBe(
      false,
    );
  });

  it("still says yes to everything when no target is chosen", () => {
    expect(supportsBlock("all", "physical-electrical.semiconductor.mosfet_n")).toBe(true);
  });
});
