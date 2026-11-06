/**
 * The `.gsim_sim_result` document — a simulation result as a file.
 *
 * Mirrors `packages/schemas/definitions/results/gsim_sim_result.schema.json`, which
 * is the source of truth (AGENTS.md: cross-language schemas live there). The
 * spec is `docs/specs/gsim-sim-format-spec.md`.
 */

/** Base64 of little-endian IEEE-754 doubles, or a plain array of numbers. */
export type SampleEncoding = "f64-base64" | "json";

export interface GsimSimResultVector {
  name: string;
  unit: string;
  quantity?: string;
  domain?: "time" | "frequency" | "parameter";
  encoding: SampleEncoding;
  data: string | number[];
}

export interface GsimSimResultSignal extends GsimSimResultVector {
  analysis?: string;
  block?: string;
  port?: string;
}

export interface GsimSimResultAxesLayout {
  row: number;
  col: number;
  signals: string[];
  colors?: string[];
}

export interface GsimSimResultFigureLayout {
  name: string;
  rows: number;
  cols: number;
  axes: GsimSimResultAxesLayout[];
}

export interface GsimSimResultRun {
  id: string;
  analysis: string;
  source?: string;
  created?: string;
  engine?: string;
}

export interface GsimSimResultDocument {
  schema_version: 1;
  run: GsimSimResultRun;
  sweep: GsimSimResultVector;
  signals: GsimSimResultSignal[];
  layout?: { figures: GsimSimResultFigureLayout[] };
}
