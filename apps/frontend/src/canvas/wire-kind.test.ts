import { describe, expect, it } from "vitest";
import { loadCatalogFromManifest } from "../library/catalog";
import type { Block, BlockMetadata } from "../model/types";
import { wireKindFromMetadata, wireKindOf } from "./wire-kind";

const CATALOG: Record<string, BlockMetadata> = loadCatalogFromManifest();

function blockOf(type: string, params: Block["params"] = {}): Block {
  const metadata = CATALOG[type];
  if (!metadata) throw new Error(`no catalog entry for ${type}`);
  return {
    id: `b_${type}`,
    type,
    paradigm: metadata.paradigm,
    // The block's *declared* domain, which is the thing this module must not use as a wire's
    // kind. Taken from the catalogue so these cases keep matching the shipped library rather
    // than a hand-written guess about it.
    domain: metadata.domain,
    fidelity: "ideal",
    position: [0, 0],
    rotation: 0,
    mirror: "none",
    params,
    ic: {},
  } as Block;
}

describe("a wire's kind", () => {
  /**
   * The two components where the block's domain and the port's kind genuinely differ. They are
   * asserted as a pair with the block domain spelled out, because the bug was not a wrong
   * lookup -- it was reading a field that is right about something else.
   */
  it.each([
    { type: "converter.sig2phys", port: "out", blockDomain: "mixed", kind: "physical-electrical" },
    { type: "converter.sig2phys", port: "in", blockDomain: "mixed", kind: "signal" },
    { type: "routing.bus_creator", port: "bus", blockDomain: "signal", kind: "signal-bus" },
  ])(
    "on $type.$port is $kind, not the block's $blockDomain",
    ({ type, port, blockDomain, kind }) => {
      const block = blockOf(type);
      expect(block.domain, "the catalogue's own block domain").toBe(blockDomain);
      expect(wireKindOf(block, port, CATALOG)).toBe(kind);
    },
  );

  it("agrees with the block's domain wherever the two agree", () => {
    for (const [type, port] of [
      ["passive.resistor", "p"],
      ["control.gain", "out"],
      ["routing.ground", "gnd"],
    ] as const) {
      const block = blockOf(type);
      expect(wireKindOf(block, port, CATALOG), `${type}.${port}`).toBe(block.domain);
    }
  });

  /**
   * A variadic port exists only once a parameter says so, so resolving it is not optional: a
   * `control.sum` input is `in0`, which is in no static port list.
   */
  it("resolves a port that only exists because a parameter made it", () => {
    const sum = blockOf("control.sum", { signs: "+-" });
    expect(wireKindOf(sum, "in1", CATALOG)).toBe("signal");
  });

  /**
   * The fallback, stated as a test so it cannot quietly become the normal path. A
   * `routing.junction`'s `node` port is deliberately undeclared -- it takes the domain of
   * whatever meets it -- and an unknown port on a known block must still produce a drawable
   * wire rather than `undefined`.
   */
  it("falls back to the block's domain only when the port cannot be resolved", () => {
    const resistor = blockOf("passive.resistor");
    expect(wireKindOf(resistor, "no_such_port", CATALOG)).toBe(resistor.domain);
    expect(wireKindOf({ ...resistor, type: "not.in.the.catalogue" }, "p", CATALOG)).toBe(
      resistor.domain,
    );
  });

  it("gives the same answer from metadata already in hand", () => {
    const converter = blockOf("converter.sig2phys");
    const metadata = CATALOG["converter.sig2phys"] as BlockMetadata;
    expect(wireKindFromMetadata(converter, metadata, "out")).toBe(
      wireKindOf(converter, "out", CATALOG),
    );
  });
});
