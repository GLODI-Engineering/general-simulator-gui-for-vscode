import { describe, expect, it } from "vitest";

import type { Block } from "../model/types";
import { assignRefdes, isAutoRefdes, refdesPrefix } from "./refdes";

function labelled(...labels: string[]): Block[] {
  return labels.map((label, i) => ({ id: `b${i}`, label }) as Block);
}

describe("refdesPrefix", () => {
  it("uses the SPICE letter for a passive or a device", () => {
    expect(refdesPrefix("passive.resistor")).toBe("R");
    expect(refdesPrefix("passive.capacitor")).toBe("C");
    expect(refdesPrefix("active.mosfet.vdmos")).toBe("M");
  });

  it("uses the type's last path segment for a signal-flow block", () => {
    expect(refdesPrefix("control.sum")).toBe("Sum");
    expect(refdesPrefix("machine.pmsm")).toBe("Pmsm");
  });
});

describe("assignRefdes", () => {
  it("takes the next number above the highest one in use", () => {
    expect(assignRefdes("passive.resistor", labelled("R1", "R7", "C2"))).toBe("R8");
  });

  it("starts at 1 on an empty sheet", () => {
    expect(assignRefdes("control.sum", [])).toBe("Sum1");
  });
});

describe("isAutoRefdes", () => {
  it("recognises exactly what assignRefdes would have produced", () => {
    expect(isAutoRefdes("Sum1", "control.sum")).toBe(true);
    expect(isAutoRefdes("Pmsm12", "machine.pmsm")).toBe(true);
    expect(isAutoRefdes("R3", "passive.resistor")).toBe(true);
  });

  it("rejects a name the author chose", () => {
    expect(isAutoRefdes("IM", "machine.pmsm")).toBe(false);
    expect(isAutoRefdes("Voltage Decoupling", "control.sum")).toBe(false);
    // Right prefix, no number — a name, not a designator.
    expect(isAutoRefdes("Sum", "control.sum")).toBe(false);
    // Right shape, wrong type.
    expect(isAutoRefdes("R1", "machine.pmsm")).toBe(false);
  });
});
