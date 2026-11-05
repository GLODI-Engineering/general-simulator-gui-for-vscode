import { describe, expect, it } from "vitest";

import type { PortKind } from "../../model/types";
import { shouldShowPortLabel } from "./port-labels";

const kind = (domain: PortKind["domain"]): PortKind => ({ domain }) as PortKind;

describe("shouldShowPortLabel", () => {
  it("hides the name on electrical terminals", () => {
    // `p`/`n` on a resistor, `A`/`K` on a diode, `c+`/`c-` on a switch coil:
    // the glyph already says which end is which.
    expect(shouldShowPortLabel(kind("physical-electrical"))).toBe(false);
  });

  it("hides the name on the other physical domains too", () => {
    expect(shouldShowPortLabel(kind("physical-thermal"))).toBe(false);
    expect(shouldShowPortLabel(kind("physical-translational"))).toBe(false);
    expect(shouldShowPortLabel(kind("physical-rotational"))).toBe(false);
  });

  it("keeps the name on signal ports, where it is the whole interface", () => {
    expect(shouldShowPortLabel(kind("signal"))).toBe(true);
    expect(shouldShowPortLabel(kind("signal-bus"))).toBe(true);
    expect(shouldShowPortLabel(kind("function-call"))).toBe(true);
  });

  it("keeps the name on a physical-signal port", () => {
    // A measured quantity crossing into the control layer — the name is what
    // says which quantity it is.
    expect(shouldShowPortLabel(kind("physical-signal"))).toBe(true);
  });

  it("keeps the name on a mixed port, where nothing else disambiguates it", () => {
    expect(shouldShowPortLabel(kind("mixed"))).toBe(true);
  });
});
