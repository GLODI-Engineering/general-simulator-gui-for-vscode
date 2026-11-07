/**
 * FE-87 — Domain-specific port marker shapes and accessibility labels.
 *
 * This file was a scaffold. Its checklist already said
 * "signal and physical-electrical ports render distinct shapes", and they did
 * not: `Port.tsx` carried its own colour switch in which `signal` was
 * `#111827` and `physical-electrical` `#0a0a0a` — two blacks nobody can tell
 * apart — and drew the identical 2px dot for every domain. The requirement
 * was written down, nothing executed the check, and the one canvas that hosts
 * both paradigms at once drew their terminals identically.
 */

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PortKindDomain } from "../../model/types";
import { REJECT_COLOR, isCausalDomain, wireColorForDomain } from "../edges/wire-color";
import { Port } from "./Port";

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

function renderPort(
  domain: PortKindDomain,
  direction: "in" | "out" | "inout" = "inout",
  side: "left" | "right" | "top" | "bottom" = "left",
) {
  const { container } = render(
    <svg>
      <Port id="p" x={0} y={0} kind={{ domain }} direction={direction} side={side} />
    </svg>,
  );
  return container;
}

describe("FE-87 — a port's marker says which paradigm it belongs to", () => {
  it("gives every domain a marker", () => {
    for (const domain of ALL_DOMAINS) {
      const c = renderPort(domain);
      expect(c.querySelector("[data-port-marker]"), domain).not.toBeNull();
    }
  });

  it("draws a causal port as an arrowhead and an acausal one as a circle", () => {
    for (const domain of ALL_DOMAINS) {
      const marker = renderPort(domain).querySelector("[data-port-marker]");
      const expected = isCausalDomain(domain) ? "causal" : "acausal";
      expect(marker?.getAttribute("data-port-marker"), domain).toBe(expected);
      // The shape itself differs, not just the attribute: an arrowhead is a
      // polygon, a terminal is a circle. A reader with the colours stripped
      // away — printed, greyscale, colour-blind — still sees two things.
      expect(marker?.tagName.toLowerCase(), domain).toBe(
        isCausalDomain(domain) ? "polygon" : "circle",
      );
    }
  });

  it("separates signal from physical-electrical in shape AND colour", () => {
    const sig = renderPort("signal").querySelector("[data-port-marker]");
    const elec = renderPort("physical-electrical").querySelector("[data-port-marker]");
    expect(sig?.tagName).not.toBe(elec?.tagName);
    // The regression that was actually shipped: two near-identical blacks.
    expect(wireColorForDomain("signal")).not.toBe(wireColorForDomain("physical-electrical"));
  });

  it("takes its colour from the wire table, so a port matches its own wire", () => {
    for (const domain of ALL_DOMAINS) {
      const marker = renderPort(domain).querySelector("[data-port-marker]");
      const expected = wireColorForDomain(domain);
      // Causal markers are filled; acausal ones are stroked open circles.
      const actual = isCausalDomain(domain)
        ? marker?.getAttribute("fill")
        : marker?.getAttribute("stroke");
      expect(actual, domain).toBe(expected);
      expect(actual, domain).not.toBe(REJECT_COLOR);
    }
  });

  it("leaves an acausal terminal unfilled, so it is not read as a junction", () => {
    // A filled dot already means something on this canvas: wires join here.
    const marker = renderPort("physical-electrical").querySelector("[data-port-marker]");
    expect(marker?.getAttribute("fill")).toBe("#ffffff");
  });

  it("points a signal arrowhead the way the value travels", () => {
    // An input on the left face: its lead points left, but the value arrives
    // travelling right, into the block. The arrow follows the value.
    const inPts = renderPort("signal", "in", "left")
      .querySelector("polygon")
      ?.getAttribute("points");
    const outPts = renderPort("signal", "out", "left")
      .querySelector("polygon")
      ?.getAttribute("points");
    expect(inPts).toBeDefined();
    expect(outPts).toBeDefined();
    expect(inPts).not.toBe(outPts);
    const noseX = (pts: string) => Number(pts.split(" ")[0].split(",")[0]);
    // Nose further right (towards the block) for an input than for an output.
    expect(noseX(inPts as string)).toBeGreaterThan(noseX(outPts as string));
  });

  it("names the domain and direction in the accessible label", () => {
    const c = renderPort("physical-thermal", "in");
    expect(c.querySelector("[data-port-id]")?.getAttribute("aria-label")).toContain(
      "physical-thermal",
    );
    expect(c.querySelector("[data-port-id]")?.getAttribute("aria-label")).toContain("in");
  });

  it("draws no marker when the symbol draws its own ports", () => {
    const { container } = render(
      <svg>
        <Port id="p" x={0} y={0} kind={{ domain: "signal" }} side="left" decorate={false} />
      </svg>,
    );
    expect(container.querySelector("[data-port-marker]")).toBeNull();
  });
});
