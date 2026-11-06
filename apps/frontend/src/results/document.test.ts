import { describe, expect, it } from "vitest";

import type { WaveformSignal } from "../waveform/types";
import {
  GsimSimResultError,
  buildGsimSimResult,
  defaultLayout,
  parseGsimSimResult,
  serializeGsimSimResult,
} from "./document";

function signal(name: string, quantity: string, unit: string, values: number[]): WaveformSignal {
  return {
    simId: "run-1",
    name,
    analysis: "tran",
    quantity,
    unit,
    domain: "time",
    time: Float64Array.from(values.map((_, i) => i * 1e-6)),
    values: Float64Array.from(values),
  };
}

const SWEEP = Float64Array.from([0, 1e-6, 2e-6, 3e-6]);
const RUN = { id: "run-1", analysis: "TRAN" };

describe("round trip", () => {
  it("comes back with the same samples, units and quantities", () => {
    const signals = [
      signal("V(out)", "voltage", "V", [0, 1, 2, 3]),
      signal("I(L1)", "current", "A", [0, 0.5, 1, 1.5]),
    ];
    const text = serializeGsimSimResult(buildGsimSimResult(SWEEP, signals, { run: RUN }));
    const loaded = parseGsimSimResult(text);

    expect(loaded.run).toEqual(RUN);
    expect(Array.from(loaded.sweep)).toEqual(Array.from(SWEEP));
    expect(loaded.signals.map((s) => s.name)).toEqual(["V(out)", "I(L1)"]);
    expect(loaded.signals.map((s) => s.unit)).toEqual(["V", "A"]);
    expect(loaded.signals.map((s) => s.quantity)).toEqual(["voltage", "current"]);
    expect(Array.from(loaded.signals[1]?.values ?? [])).toEqual([0, 0.5, 1, 1.5]);
  });

  it("keeps a layout the viewer supplied", () => {
    const signals = [signal("V(out)", "voltage", "V", [0, 1, 2, 3])];
    const layout = [
      { name: "Figure 1", rows: 1, cols: 1, axes: [{ row: 0, col: 0, signals: ["V(out)"] }] },
    ];
    const text = serializeGsimSimResult(buildGsimSimResult(SWEEP, signals, { run: RUN, layout }));
    expect(parseGsimSimResult(text).layout).toEqual(layout);
  });

  it("names the sweep axis from the signals' domain", () => {
    const ac: WaveformSignal = { ...signal("gain", "dB", "dB", [0, 1, 2, 3]), domain: "frequency" };
    const doc = buildGsimSimResult(SWEEP, [ac], { run: { id: "r", analysis: "AC" } });
    expect(doc.sweep.domain).toBe("frequency");
    expect(doc.sweep.unit).toBe("Hz");
    expect(parseGsimSimResult(serializeGsimSimResult(doc)).sweepDomain).toBe("frequency");
  });

  it("lets the reader override the sim id, so two files can be open at once", () => {
    const text = serializeGsimSimResult(
      buildGsimSimResult(SWEEP, [signal("V(out)", "voltage", "V", [0, 1, 2, 3])], { run: RUN }),
    );
    expect(parseGsimSimResult(text, "other").signals[0]?.simId).toBe("other");
  });
});

describe("parse rejects what it cannot plot", () => {
  it("says so plainly when the file is not JSON", () => {
    expect(() => parseGsimSimResult("{not json")).toThrow(GsimSimResultError);
    expect(() => parseGsimSimResult("{not json")).toThrow(/valid JSON/);
  });

  it("points at the offending field when the shape is wrong", () => {
    expect(() => parseGsimSimResult(JSON.stringify({ schema_version: 1 }))).toThrow(
      /\.gsim_sim_result document/,
    );
  });

  it("refuses a schema version it does not know rather than guessing", () => {
    const doc = buildGsimSimResult(SWEEP, [signal("V", "voltage", "V", [0, 1, 2, 3])], {
      run: RUN,
    }) as unknown as { schema_version: number };
    doc.schema_version = 3;
    expect(() => parseGsimSimResult(JSON.stringify(doc))).toThrow(/schema_version/);
  });

  /**
   * v1 had no `data` block because there was only one possibility: the
   * samples were always inline. The format shipped, so those files have to
   * keep opening.
   */
  it("still reads a v1 document, by giving it the data block it implied", () => {
    const v2 = buildGsimSimResult(SWEEP, [signal("V(out)", "voltage", "V", [0, 1, 2, 3])], {
      run: RUN,
    }) as unknown as Record<string, unknown>;
    const { data: _dropped, ...withoutData } = v2;
    const v1 = JSON.stringify({ ...withoutData, schema_version: 1 });

    const loaded = parseGsimSimResult(v1);
    expect(loaded.signals.map((s) => s.name)).toEqual(["V(out)"]);
    expect(Array.from(loaded.signals[0]?.values ?? [])).toEqual([0, 1, 2, 3]);
  });

  it("says where the samples are when they are not in the file", () => {
    // Failing three frames deeper on a missing `data` field would send the
    // reader looking for a corrupt document instead of a missing file.
    const doc = {
      schema_version: 2,
      run: RUN,
      data: { kind: "hdf5", path: "run-17.h5" },
      sweep: { name: "time", unit: "s", domain: "time", dataset: "time" },
      signals: [{ name: "V(out)", unit: "V", quantity: "voltage", dataset: "b__out" }],
    };
    expect(() => parseGsimSimResult(JSON.stringify(doc))).toThrow(/run-17\.h5/);
  });

  it("writes a self-contained file from the viewer's own export", () => {
    // The exported file is the one someone attaches to a review or commits
    // as a fixture; a result that needs a second file is not that.
    const doc = buildGsimSimResult(SWEEP, [signal("V", "voltage", "V", [0, 1, 2, 3])], {
      run: RUN,
    });
    expect(doc.schema_version).toBe(2);
    expect(doc.data).toEqual({ kind: "inline" });
  });

  /**
   * The one cross-field invariant JSON Schema cannot state, and the one
   * whose breach is invisible downstream: a short signal is not an error to
   * the chart, it just plots every y against the wrong x.
   */
  it("rejects a signal whose length disagrees with the sweep", () => {
    const doc = buildGsimSimResult(SWEEP, [signal("V(out)", "voltage", "V", [0, 1, 2, 3])], {
      run: RUN,
    });
    const short = doc.signals[0];
    if (short) short.data = [0, 1, 2];
    if (short) short.encoding = "json";
    expect(() => parseGsimSimResult(JSON.stringify(doc))).toThrow(/3 samples but the sweep has 4/);
  });
});

describe("defaultLayout", () => {
  it("puts each quantity on its own axes", () => {
    // Autoscaling a 48 V trace together with a 2 A one flattens the current
    // to a line, so "everything on one axes" is the wrong default the
    // moment a result holds two quantities.
    const layout = defaultLayout([
      signal("V(sw)", "voltage", "V", [0, 48, 0, 48]),
      signal("I(L1)", "current", "A", [0, 1, 2, 1]),
      signal("V(out)", "voltage", "V", [0, 11, 12, 11]),
    ]);
    expect(layout).toHaveLength(1);
    expect(layout[0]?.rows).toBe(2);
    expect(layout[0]?.axes.map((a) => a.signals)).toEqual([["V(sw)", "V(out)"], ["I(L1)"]]);
  });

  it("returns nothing for a result with no signals", () => {
    expect(defaultLayout([])).toEqual([]);
  });
});
