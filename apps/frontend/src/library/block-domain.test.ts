import { describe, expect, it } from "vitest";

import type { BlockMetadata } from "../model/types";
import { blockDomainOf } from "./block-domain";
import { loadCatalogFromManifest } from "./catalog";

/**
 * A block's domain decides its wire colour, its port symbols and which side of
 * the causal/acausal split it sits on. It used to be guessed from the first
 * port, in two copies of the same function, and the guess disagreed with the
 * engine's own declaration for ten of 239 components — every one of them a
 * component that straddles two domains, which is exactly when a first-port
 * heuristic has to be wrong.
 */
describe("blockDomainOf", () => {
  const catalog = loadCatalogFromManifest();

  /** name -> what the first-port guess used to produce */
  const PREVIOUSLY_WRONG: Array<[string, string]> = [
    ["converter.phys2sig", "signal"],
    ["converter.sig2phys", "physical-electrical"],
    ["hierarchy.subsystem.enabled", "signal"],
    ["hierarchy.subsystem.triggered", "signal"],
    ["physical_electrical.semiconductor.photodiode", "physical-signal"],
    ["physical_translational.sensor.force", "physical-signal"],
    ["physical_translational.sensor.position", "physical-signal"],
    ["physical_translational.sensor.velocity", "physical-signal"],
    ["routing.bus_assignment", "signal-bus"],
    ["routing.bus_creator", "signal-bus"],
  ];

  it.each(PREVIOUSLY_WRONG)("%s keeps its declared domain, not the first port's", (name, guess) => {
    const metadata = catalog[name];
    expect(metadata, `${name} missing from the catalogue`).toBeDefined();
    const declared = (metadata as BlockMetadata).domain;
    expect(blockDomainOf(metadata as BlockMetadata)).toBe(declared);
    expect(blockDomainOf(metadata as BlockMetadata)).not.toBe(guess);
  });

  it("agrees with the declaration for every component the engine ships", () => {
    const seen = new Set<string>();
    const mismatches: string[] = [];
    for (const metadata of Object.values(catalog)) {
      if (seen.has(metadata.name)) continue;
      seen.add(metadata.name);
      if (!metadata.domain) continue;
      const got = blockDomainOf(metadata);
      if (got !== metadata.domain)
        mismatches.push(`${metadata.name}: ${metadata.domain} -> ${got}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("falls back to a port only when nothing is declared", () => {
    const bare = {
      name: "x.y",
      label: "X",
      ports: {
        inputs: [{ id: "a", label: "A", kind: { domain: "physical-rotational" } }],
        outputs: [],
      },
    } as unknown as BlockMetadata;
    expect(blockDomainOf(bare)).toBe("physical-rotational");
  });

  it("never invents a translational domain for a rotational block", () => {
    // `behavior.domain` says `mechanical` for both, and the translation that
    // used to bridge the two vocabularies answered `physical-translational`
    // every time. Nothing reads `behavior.domain` for this any more.
    const rotational = Object.values(catalog).filter((m) => m.domain === "physical-rotational");
    expect(rotational.length).toBeGreaterThan(0);
    for (const metadata of rotational) {
      expect(blockDomainOf(metadata)).toBe("physical-rotational");
    }
  });
});
