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

  /**
   * name -> what the first-port guess used to produce.
   *
   * Ten components straddled two domains and the guess was wrong about every one. Eight of them
   * were components no engine could compile and gsim-core#59 removed them: the two subsystems,
   * the photodiode, the three translational sensors and the two bus blocks. The two that remain
   * are the converters, which is fitting — a converter exists *to* straddle two domains, so it
   * is the case a first-port heuristic can never get right, and two of them still demonstrate
   * that `blockDomainOf` reads the declaration.
   *
   * The eight are not lost: they are in the issue and in that repository's git history. Adding
   * a synthetic stand-in for each would test this module against a hand-written guess about the
   * library rather than against the library, which is the mistake the module was fixing.
   */
  const PREVIOUSLY_WRONG: Array<[string, string]> = [
    ["converter.phys2sig", "signal"],
    ["converter.sig2phys", "physical-electrical"],
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
    //
    // Asserted against a hand-built block rather than the shipped library, which is a
    // deliberate exception to the rule the comment above states. gsim-core#59 removed every
    // rotational component, so the library carries no case to read: its block domains are now
    // `signal`, `physical-electrical` and `mixed` only. The alternative was to delete the test,
    // and the bug it pins is in this module rather than in the library -- a `mechanical`
    // behaviour domain must not become a translational block domain, whoever ships the block.
    const rotational = {
      name: "x.rot",
      label: "X",
      domain: "physical-rotational",
      behavior: { domain: "mechanical" },
      ports: {
        inputs: [{ id: "a", label: "A", kind: { domain: "physical-rotational" } }],
        outputs: [],
      },
    } as unknown as BlockMetadata;
    expect(blockDomainOf(rotational)).toBe("physical-rotational");

    // And nothing in the shipped library contradicts the declaration either, which is what the
    // sweep above covers for the domains that are left.
    expect(Object.values(catalog).some((m) => m.domain === "physical-rotational")).toBe(false);
  });
});
