/**
 * Parsing and building `.gsim_sim_result` documents.
 *
 * A `.gsim_sim_result` is a simulation result that lives in the workspace as one
 * file, rather than in the kernel's private cache behind a session-scoped id.
 * The distinction is the whole point of the format: the viewer could
 * previously only show results while the kernel session that produced them
 * was still alive, so a run could not be committed, attached to a review,
 * reopened next week, or compared against one from a different branch.
 *
 * The file is self-contained: the sweep axis, every signal's samples, their
 * units and quantities, and optionally the figure layout they were shown in.
 * Nothing in it refers to a running process.
 */
import { validateGsimSimResultDocument } from "../generated/validators/gsim-sim-result.js";
import type { WaveformSignal } from "../waveform/types";
import { decodeSamples, encodeSamples, encodingFor } from "./codec";
import type {
  GsimSimResultDocument,
  GsimSimResultFigureLayout,
  GsimSimResultRun,
  GsimSimResultSignal,
} from "./types";

export class GsimSimResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GsimSimResultError";
  }
}

/** One result, decoded and ready for the waveform store. */
export interface LoadedResult {
  run: GsimSimResultRun;
  sweep: Float64Array;
  sweepDomain: "time" | "frequency" | "parameter";
  signals: WaveformSignal[];
  layout: GsimSimResultFigureLayout[];
}

/**
 * Bring a v1 document up to the v2 shape.
 *
 * v1 had no `data` block because there was only one possibility: the
 * samples were always inline. Rather than carry two schemas and two code
 * paths for a difference that is one field, a v1 document is given the
 * block it was implying and then validated like any other. Files written
 * before v2 therefore keep opening, which matters — the format shipped.
 */
export function upgradeToV2(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const doc = raw as Record<string, unknown>;
  if (doc.schema_version !== 1) return raw;
  return { ...doc, schema_version: 2, data: { kind: "inline" } };
}

export function parseGsimSimResult(text: string, simId?: string): LoadedResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new GsimSimResultError(`Not valid JSON: ${(error as Error).message}`);
  }

  raw = upgradeToV2(raw);

  if (!validateGsimSimResultDocument(raw)) {
    const [first] = validateGsimSimResultDocument.errors ?? [];
    const where = first?.instancePath || "/";
    throw new GsimSimResultError(
      `Not a .gsim_sim_result document — ${where}: ${first?.message ?? "schema validation failed"}`,
    );
  }

  const doc: GsimSimResultDocument = raw;

  if (doc.data.kind !== "inline") {
    // Reading an HDF5-backed result needs the data file as well as this
    // one, and a reader that can open it. Say so rather than failing on a
    // missing `data` field three frames deeper.
    throw new GsimSimResultError(
      `This result keeps its samples in "${doc.data.path}". ` +
        "Open it through a source that can read that file, not as a standalone document.",
    );
  }

  const sweep = decodeSamples(doc.sweep);
  const domain = doc.sweep.domain ?? "time";
  const id = simId ?? doc.run.id;

  const signals: WaveformSignal[] = doc.signals.map((signal) => {
    const values = decodeSamples(signal);
    if (values.length !== sweep.length) {
      // Length is the one cross-field invariant JSON Schema cannot state,
      // and getting it wrong is not a visible error downstream — the chart
      // just plots each y against the wrong x.
      throw new GsimSimResultError(
        `Signal "${signal.name}" has ${values.length} samples but the sweep has ${sweep.length}.`,
      );
    }
    return {
      simId: id,
      name: signal.name,
      analysis: signal.analysis ?? "tran",
      quantity: signal.quantity ?? "dimensionless",
      unit: signal.unit,
      domain,
      time: sweep,
      values,
    };
  });

  return {
    run: doc.run,
    sweep,
    sweepDomain: domain,
    signals,
    layout: doc.layout?.figures ?? defaultLayout(signals),
  };
}

/**
 * One axes per quantity, in the order the quantities first appear.
 *
 * A file written by a script will usually carry no layout, and "every signal
 * on one axes" is the wrong default the moment a result holds both volts and
 * amps: autoscaling a 48 V trace and a 2 A trace together flattens the
 * current to a line.
 */
export function defaultLayout(signals: WaveformSignal[]): GsimSimResultFigureLayout[] {
  const byQuantity = new Map<string, string[]>();
  for (const signal of signals) {
    const key = signal.quantity || "dimensionless";
    const bucket = byQuantity.get(key);
    if (bucket) bucket.push(signal.name);
    else byQuantity.set(key, [signal.name]);
  }
  const groups = [...byQuantity.values()];
  if (groups.length === 0) return [];
  return [
    {
      name: "Results",
      rows: groups.length,
      cols: 1,
      axes: groups.map((names, row) => ({ row, col: 0, signals: names })),
    },
  ];
}

export interface BuildOptions {
  run: GsimSimResultRun;
  sweepName?: string;
  sweepUnit?: string;
  layout?: GsimSimResultFigureLayout[];
}

/** Build a document from decoded signals, ready to be stringified and written. */
export function buildGsimSimResult(
  sweep: Float64Array,
  signals: WaveformSignal[],
  options: BuildOptions,
): GsimSimResultDocument {
  const domain = signals[0]?.domain;
  const sweepDomain =
    domain === "frequency" || domain === "parameter" || domain === "time" ? domain : "time";
  const encoding = encodingFor(sweep.length);

  const DEFAULT_SWEEP: Record<string, { name: string; unit: string; quantity: string }> = {
    time: { name: "time", unit: "s", quantity: "time" },
    frequency: { name: "frequency", unit: "Hz", quantity: "frequency" },
    parameter: { name: "parameter", unit: "", quantity: "parameter" },
  };
  const fallback = DEFAULT_SWEEP[sweepDomain] as { name: string; unit: string; quantity: string };

  const written: GsimSimResultSignal[] = signals.map((signal) => ({
    name: signal.name,
    unit: signal.unit,
    quantity: signal.quantity,
    analysis: signal.analysis,
    encoding,
    data: encodeSamples(signal.values, encoding),
  }));

  const doc: GsimSimResultDocument = {
    schema_version: 2,
    run: options.run,
    // The viewer's own export writes a self-contained file: it is the one
    // someone attaches to a review or commits as a fixture, and a result
    // that needs a second file to be read is no longer that.
    data: { kind: "inline" },
    sweep: {
      name: options.sweepName ?? fallback.name,
      unit: options.sweepUnit ?? fallback.unit,
      quantity: fallback.quantity,
      domain: sweepDomain,
      encoding,
      data: encodeSamples(sweep, encoding),
    },
    signals: written,
  };
  if (options.layout && options.layout.length > 0) {
    doc.layout = { figures: options.layout };
  }
  return doc;
}

/** Serialize a document. Two-space indent, like every other file this repo writes. */
export function serializeGsimSimResult(doc: GsimSimResultDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}
