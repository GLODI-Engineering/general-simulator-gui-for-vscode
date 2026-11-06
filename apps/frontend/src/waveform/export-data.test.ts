import { describe, expect, it } from "vitest";

import { parseGsimSimResult } from "../results/document";
import { ExportDataError, runFor, toCsv, toSimResult } from "./export-data";
import type { WaveformSignal } from "./types";

function signal(
  name: string,
  quantity: string,
  unit: string,
  values: number[],
  domain = "time",
): WaveformSignal {
  return {
    simId: "run-1",
    name,
    analysis: "tran",
    quantity,
    unit,
    domain,
    time: Float64Array.from(values.map((_, i) => i * 1e-3)),
    values: Float64Array.from(values),
  };
}

describe("toCsv", () => {
  it("writes the sweep column, then one column per signal", () => {
    const csv = toCsv([
      signal("V(out)", "voltage", "V", [0, 1, 2]),
      signal("I(L1)", "current", "A", [0, 0.5, 1]),
    ]);
    expect(csv.split("\n")).toEqual([
      "time (s),V(out) (V),I(L1) (A)",
      "0,0,0",
      "0.001,1,0.5",
      "0.002,2,1",
      "",
    ]);
  });

  it("names the sweep column by what is actually swept", () => {
    const ac = signal("gain", "dB", "dB", [0, 1, 2], "frequency");
    expect(toCsv([ac]).split("\n")[0]).toBe("frequency (Hz),gain (dB)");
  });

  it("writes values at full precision, not a rounded display form", () => {
    // A CSV is what someone cross-checks against. Truncating here turns a
    // 1e-14 agreement into a 1e-6 one and the check becomes meaningless.
    const csv = toCsv([signal("v", "voltage", "V", [1 / 3, Math.PI, 1e-17])]);
    const values = csv
      .split("\n")
      .slice(1, 4)
      .map((row) => Number(row.split(",")[1]));
    expect(values).toEqual([1 / 3, Math.PI, 1e-17]);
  });

  it("spells out the non-finite values a diverging solve produces", () => {
    // Left as empty cells they read as missing data rather than as the
    // solver having blown up, which is the opposite of the truth.
    const csv = toCsv([
      signal("v", "voltage", "V", [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]),
    ]);
    expect(
      csv
        .split("\n")
        .slice(1, 4)
        .map((r) => r.split(",")[1]),
    ).toEqual(["NaN", "Inf", "-Inf"]);
  });

  it("quotes a signal name containing a comma", () => {
    const csv = toCsv([signal("V(a,b)", "voltage", "V", [0, 1, 2])]);
    expect(csv.split("\n")[0]).toBe('time (s),"V(a,b) (V)"');
  });

  it("refuses to build a table out of columns of different lengths", () => {
    expect(() =>
      toCsv([signal("V(out)", "voltage", "V", [0, 1, 2]), signal("I(L1)", "current", "A", [0, 1])]),
    ).toThrow(ExportDataError);
  });

  it("says so when there is nothing on the plot", () => {
    expect(() => toCsv([])).toThrow(/no signals/);
  });
});

describe("toSimResult", () => {
  it("round-trips through the parser with units and quantities intact", () => {
    const signals = [
      signal("V(out)", "voltage", "V", [0, 1, 2]),
      signal("I(L1)", "current", "A", [0, 0.5, 1]),
    ];
    const loaded = parseGsimSimResult(toSimResult(signals, { id: "r", analysis: "TRAN" }));
    expect(loaded.signals.map((s) => [s.name, s.unit, s.quantity])).toEqual([
      ["V(out)", "V", "voltage"],
      ["I(L1)", "A", "current"],
    ]);
    expect(Array.from(loaded.signals[1]?.values ?? [])).toEqual([0, 0.5, 1]);
  });

  it("carries the layout it was given", () => {
    const layout = [
      { name: "Buck", rows: 1, cols: 1, axes: [{ row: 0, col: 0, signals: ["V(out)"] }] },
    ];
    const text = toSimResult(
      [signal("V(out)", "voltage", "V", [0, 1, 2])],
      {
        id: "r",
        analysis: "TRAN",
      },
      layout,
    );
    expect(parseGsimSimResult(text).layout).toEqual(layout);
  });
});

describe("runFor", () => {
  it("reads the analysis off the signals rather than assuming a transient", () => {
    // Writing "TRAN" into the record of an AC sweep is a false claim in a
    // file that exists to be the record.
    expect(runFor([signal("v", "voltage", "V", [0, 1], "time")], "r").analysis).toBe("TRAN");
    expect(runFor([signal("g", "dB", "dB", [0, 1], "frequency")], "r").analysis).toBe("AC");
    expect(runFor([signal("s", "voltage", "V", [0, 1], "parameter")], "r").analysis).toBe("DC");
  });

  it("records where it came from when that is known", () => {
    const run = runFor([signal("v", "voltage", "V", [0, 1])], "r", "buck.gsim_sch");
    expect(run.source).toBe("buck.gsim_sch");
    expect(run.created).toMatch(/^\d{4}-/);
  });
});
