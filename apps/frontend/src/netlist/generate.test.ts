/**
 * FE-152: generateNetlist() source-card tests
 *
 * Acceptance:
 * - A DC voltage/current source still renders `DC <value>` (unchanged).
 * - A Pulse voltage/current source with real timing params (V1/V2/... or
 *   I1/I2/...) renders a proper SPICE PULSE(...) card, not DC.
 * - A "Pulse" source block that only has a flat amplitude param (no
 *   timing) falls back to DC <value> but reports a warning explaining why,
 *   instead of silently doing nothing.
 * - Sine and PWL sources render SIN(...)/PWL(...) cards.
 * - An AC source with a frequency param renders combined DC/AC/SIN cards
 *   so it produces a real waveform in a TRAN run, not a flat line.
 */

import { describe, expect, it } from "vitest";
import type { Block, Model } from "../model/types";
import { generateNetlist } from "./generate";

function makeBlock(overrides: Partial<Block> & { id: string; type: string }): Block {
  return {
    paradigm: "physical-network",
    domain: "electrical",
    fidelity: "ideal",
    position: [0, 0],
    rotation: 0,
    mirror: "none",
    params: {},
    ic: {},
    ...overrides,
  } as Block;
}

function makeModel(blocks: Block[], wires: Model["wires"] = []): Model {
  return {
    id: "model-1",
    name: "Untitled",
    grid: 10,
    params: [],
    blocks,
    wires,
    lines: [],
    nets: [],
    simulation: { analyses: [] },
    metadata: {},
  } as unknown as Model;
}

const TRAN = { type: "TRAN", tEnd: 0.01, tStep: 1e-5 };

describe("FE-152: generateNetlist source cards", () => {
  it("DC voltage source renders DC <value> (baseline, unchanged)", () => {
    const model = makeModel([
      makeBlock({ id: "v1", type: "source.voltage.dc", label: "V1", params: { V: 5 } }),
    ]);
    const { netlist, errors } = generateNetlist(model, TRAN);
    expect(netlist).toMatch(/^V1 n\d+ n\d+ DC 5$/m);
    expect(errors).toHaveLength(0);
  });

  it("Pulse voltage source with real timing params renders PULSE(...), not DC", () => {
    const model = makeModel([
      makeBlock({
        id: "v1",
        type: "source.voltage.pulse",
        label: "V1",
        params: { V1: 0, V2: 5, TD: 1e-6, TR: 1e-9, TF: 1e-9, PW: 5e-7, PER: 1e-6 },
      }),
    ]);
    const { netlist, errors } = generateNetlist(model, TRAN);
    expect(netlist).toMatch(/^V1 n\d+ n\d+ PULSE\(0 5 0\.000001 1e-9 1e-9 5e-7 0\.000001\)$/m);
    expect(errors).toHaveLength(0);
  });

  it('a "pulse" source block with only a flat amplitude param falls back to DC and warns', () => {
    const model = makeModel([
      makeBlock({
        id: "v1",
        type: "physical-electrical.source.voltage_pulse",
        label: "V1",
        params: { V: 5 },
      }),
    ]);
    const { netlist, errors } = generateNetlist(model, TRAN);
    expect(netlist).toMatch(/^V1 n\d+ n\d+ DC 5$/m);
    expect(errors.some((e) => /pulse-timing/i.test(e) && e.includes("V1"))).toBe(true);
  });

  it("Sine voltage source renders SIN(...)", () => {
    const model = makeModel([
      makeBlock({
        id: "v1",
        type: "source.voltage.sin",
        label: "V1",
        params: { VO: 0, VA: 2, FREQ: 1000, TD: 0, THETA: 0, PHASE: 0 },
      }),
    ]);
    const { netlist } = generateNetlist(model, TRAN);
    expect(netlist).toMatch(/^V1 n\d+ n\d+ SIN\(0 2 1000 0 0 0\)$/m);
  });

  it("PWL voltage source renders PWL(<points>)", () => {
    const model = makeModel([
      makeBlock({
        id: "v1",
        type: "source.voltage.pwl",
        label: "V1",
        params: { points: "0 0 1u 1 2u 0" },
      }),
    ]);
    const { netlist } = generateNetlist(model, TRAN);
    expect(netlist).toMatch(/^V1 n\d+ n\d+ PWL\(0 0 1u 1 2u 0\)$/m);
  });

  it("AC voltage source with a frequency param renders a real TRAN waveform, not a flat line", () => {
    const model = makeModel([
      makeBlock({
        id: "v1",
        type: "physical-electrical.source.voltage_ac",
        label: "V1",
        params: { amplitude: 3, frequency: 60 },
      }),
    ]);
    const { netlist } = generateNetlist(model, TRAN);
    expect(netlist).toMatch(/^V1 n\d+ n\d+ DC 0 AC 3 SIN\(0 3 60\)$/m);
  });

  it("Pulse current source uses I1/I2 params and the I prefix, mirroring voltage sources", () => {
    const model = makeModel([
      makeBlock({
        id: "i1",
        type: "source.current.pulse",
        label: "I1",
        params: { I1: 0, I2: 1, TD: 0, TR: 1e-9, TF: 1e-9, PW: 5e-7, PER: 1e-6 },
      }),
    ]);
    const { netlist } = generateNetlist(model, TRAN);
    expect(netlist).toMatch(/^I1 n\d+ n\d+ PULSE\(0 1 0 1e-9 1e-9 5e-7 0\.000001\)$/m);
  });
});
