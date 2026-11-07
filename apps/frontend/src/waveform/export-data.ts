/**
 * Exporting the *numbers* behind a plot, not a picture of them.
 *
 * A PNG of a waveform is evidence; it is not data. The moment anyone wants
 * to check a measurement, replot in another tool, diff two runs or hand a
 * trace to a colleague's script, an image is a dead end. These two formats
 * cover the two things people actually do with it:
 *
 * - **CSV** — one column per signal against a shared sweep column. Opens in
 *   anything, pastes into anything, and is what a quick cross-check gets
 *   written against.
 * - **`.gsim_sim_result`** — the full, exact, self-contained result: units,
 *   quantities, analysis, layout, and samples that round-trip bit-for-bit.
 *   It is the one to keep, and the one this viewer can reopen.
 *
 * CSV loses the bits and the metadata; the result file keeps both. Offering
 * only one of them would be choosing for the user which of those two jobs
 * they are doing.
 */
import { buildGsimSimResult, serializeGsimSimResult } from "../results/document";
import type { GsimSimResultFigureLayout, GsimSimResultRun } from "../results/types";
import type { WaveformSignal } from "./types";

export class ExportDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportDataError";
  }
}

/**
 * The sweep axis these signals share, or an error naming the one that does
 * not fit. Columns of different lengths are not a table.
 */
export function sharedSweep(signals: WaveformSignal[]): Float64Array {
  const first = signals[0];
  if (!first) throw new ExportDataError("There are no signals on this plot to export.");
  for (const signal of signals) {
    if (signal.values.length !== first.time.length) {
      throw new ExportDataError(
        `"${signal.name}" has ${signal.values.length} samples but "${first.name}" has ${first.time.length}. ` +
          "Signals from different runs cannot share one table — export them separately.",
      );
    }
  }
  return first.time;
}

/** Column header for the sweep axis, named by what it actually sweeps. */
function sweepHeader(signals: WaveformSignal[]): string {
  switch (signals[0]?.domain) {
    case "frequency":
      return "frequency (Hz)";
    case "parameter":
      return "parameter";
    default:
      return "time (s)";
  }
}

/**
 * A field that survives a round trip through a spreadsheet.
 *
 * `String(v)` on a double is JavaScript's shortest round-tripping
 * representation, so the CSV carries the exact value in the fewest digits
 * rather than a `toFixed` truncation of it. Non-finite values are written as
 * the words a reader will recognise instead of silently becoming empty
 * cells, which is what a diverging solve looks like otherwise.
 */
function field(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "Inf";
  if (value === Number.NEGATIVE_INFINITY) return "-Inf";
  return String(value);
}

/** Quote a header cell if it holds a comma or a quote. */
function headerCell(text: string): string {
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Build a CSV: the sweep column, then one column per signal. */
export function toCsv(signals: WaveformSignal[]): string {
  const sweep = sharedSweep(signals);
  const header = [
    sweepHeader(signals),
    ...signals.map((s) => `${s.name}${s.unit ? ` (${s.unit})` : ""}`),
  ];

  const rows: string[] = [header.map(headerCell).join(",")];
  const columns = signals.map((s) => s.values);
  for (let i = 0; i < sweep.length; i++) {
    const cells = new Array<string>(columns.length + 1);
    cells[0] = field(sweep[i] as number);
    for (let c = 0; c < columns.length; c++) {
      cells[c + 1] = field((columns[c] as Float64Array)[i] as number);
    }
    rows.push(cells.join(","));
  }
  // Trailing newline: POSIX text, and it keeps `wc -l` honest.
  return `${rows.join("\n")}\n`;
}

/** Build a `.gsim_sim_result` document from what the viewer is showing. */
export function toSimResult(
  signals: WaveformSignal[],
  run: GsimSimResultRun,
  layout?: GsimSimResultFigureLayout[],
): string {
  const sweep = sharedSweep(signals);
  return serializeGsimSimResult(buildGsimSimResult(sweep, signals, { run, layout }));
}

/**
 * A `run` block describing where these signals came from.
 *
 * The analysis is read back off the signals rather than asked for: a
 * frequency-domain result is an AC sweep, a parameter-domain one a DC sweep.
 * Guessing "TRAN" for all three would put a false claim in a file that is
 * meant to be the record.
 */
export function runFor(signals: WaveformSignal[], id: string, source?: string): GsimSimResultRun {
  const domain = signals[0]?.domain;
  const analysis = domain === "frequency" ? "AC" : domain === "parameter" ? "DC" : "TRAN";
  const run: GsimSimResultRun = { id, analysis, created: new Date().toISOString() };
  if (source) run.source = source;
  return run;
}
