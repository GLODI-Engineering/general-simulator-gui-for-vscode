import { describe, expect, it } from "vitest";

import type { PortKindDomain } from "../../model/types";
import { REJECT_COLOR, isCausalDomain, wireColorForDomain } from "./wire-color";

const ALL_DOMAINS: PortKindDomain[] = [
  "signal",
  "signal-bus",
  "function-call",
  "physical-electrical",
  "physical-translational",
  "physical-rotational",
  "physical-thermal",
  "physical-signal",
  "mixed",
  "reserved.physical-magnetic",
  "reserved.physical-hydraulic",
  "reserved.physical-fluid",
];

/**
 * This file was a scaffold whose checklist already said
 * "signal != physical-electrical" — and they were both `#000000`, so the two
 * paradigms this canvas hosts drew identically on any sheet that mixed them.
 * The requirement was written down and never implemented, and nothing
 * executed the check.
 */
describe("wire colour per domain", () => {
  it("gives every domain a colour", () => {
    for (const domain of ALL_DOMAINS) {
      expect(wireColorForDomain(domain), domain).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("separates signal from physical-electrical", () => {
    expect(wireColorForDomain("signal")).not.toBe(wireColorForDomain("physical-electrical"));
  });

  it("separates signal from signal-bus", () => {
    expect(wireColorForDomain("signal")).not.toBe(wireColorForDomain("signal-bus"));
  });

  it("keeps the electrical wire the near-black a schematic is drawn in", () => {
    expect(wireColorForDomain("physical-electrical")).toBe("#0f172a");
  });

  it("does not reuse the reject colour for any domain", () => {
    for (const domain of ALL_DOMAINS) {
      expect(wireColorForDomain(domain), domain).not.toBe(REJECT_COLOR);
    }
  });
});

describe("causality decides whether a wire carries an arrow", () => {
  it("gives the signal domains a direction", () => {
    // A signal goes from the block that computes it to the blocks that read
    // it, and that direction is part of the model.
    for (const domain of ["signal", "signal-bus", "function-call", "physical-signal"] as const) {
      expect(isCausalDomain(domain), domain).toBe(true);
    }
  });

  it("gives the physical domains none", () => {
    // An electrical node has a voltage across it and a current through it,
    // solved together. There is no "from" end, and an arrow would assert a
    // causality the equations do not have.
    for (const domain of [
      "physical-electrical",
      "physical-translational",
      "physical-rotational",
      "physical-thermal",
      "mixed",
    ] as const) {
      expect(isCausalDomain(domain), domain).toBe(false);
    }
  });

  it("treats an absent domain as acausal", () => {
    expect(isCausalDomain(undefined)).toBe(false);
  });
});
