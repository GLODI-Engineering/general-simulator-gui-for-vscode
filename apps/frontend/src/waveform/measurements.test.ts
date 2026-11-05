import { describe, expect, it } from "vitest";

import { computeMeasurement, measureDutyCycle, measureRms } from "./measurements";

describe("FE-117 measurements", () => {
  it("computes RMS for constant waveform", () => {
    const t = new Float64Array([0, 1, 2, 3]);
    const v = new Float64Array([2, 2, 2, 2]);
    expect(measureRms(t, v).value).toBe(2);
  });

  it("computes duty cycle for square wave", () => {
    const t = new Float64Array([0, 1, 2, 3, 4]);
    const v = new Float64Array([0, 1, 1, 0, 0]);
    const duty = measureDutyCycle(t, v).value;
    expect(duty).toBeGreaterThan(0.3);
    expect(duty).toBeLessThan(0.7);
  });

  it("dispatches frequency measurement key", () => {
    const t = new Float64Array([0, 0.5, 1, 1.5, 2]);
    const v = new Float64Array([-1, 1, -1, 1, -1]);
    const r = computeMeasurement("frequency", t, v);
    expect(r.unit).toBe("Hz");
  });
});
