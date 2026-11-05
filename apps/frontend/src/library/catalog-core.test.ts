/**
 * FE-53: catalog-core v2 tests
 *
 * Acceptance:
 * - getCatalogEntry('physical-electrical.passive.resistor', 'ideal') returns ports [p,n] and param R.
 * - listTiers('physical-electrical.passive.resistor') returns at least ['ideal'].
 * - getCatalogEntry('...', 'spice') returns null when the catalogue entry does not declare a spice tier.
 */

import { describe, expect, it } from "vitest";

import { getCatalogEntry, listTiers } from "./catalog-core";

describe("FE-53: catalog-core v2", () => {
  it("test_catalog_get_entry: getCatalogEntry('physical-electrical.passive.resistor', 'ideal') returns ports [p,n] and param R", () => {
    const entry = getCatalogEntry("physical-electrical.passive.resistor", "ideal");
    expect(entry).not.toBeNull();
    expect(entry!.ports.map((port) => port.id)).toEqual(["p", "n"]);
    expect(entry!.params.map((param) => param.id)).toContain("R");
  });

  it("test_catalog_list_tiers: listTiers('physical-electrical.passive.resistor') returns at least ['ideal']", () => {
    const tiers = listTiers("physical-electrical.passive.resistor");
    expect(tiers).toContain("ideal");
  });

  it("test_catalog_unknown_tier: getCatalogEntry('physical-thermal.element.mass', 'spice') returns null when spice tier is not declared", () => {
    const entry = getCatalogEntry("physical-thermal.element.mass", "spice");
    expect(entry).toBeNull();
  });
});
