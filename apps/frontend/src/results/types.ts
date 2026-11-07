/**
 * The `.gsim_sim_result` document — a simulation result as a file.
 *
 * Mirrors `packages/schemas/definitions/results/gsim_sim_result.schema.json`, which
 * is the source of truth (AGENTS.md: cross-language schemas live there). The
 * spec is `docs/specs/gsim-sim-format-spec.md`.
 */

/** Base64 of little-endian IEEE-754 doubles, or a plain array of numbers. */
export type SampleEncoding = "f64-base64" | "json";

/**
 * Where a document's samples live.
 *
 * `inline` keeps the file self-contained — it can be committed, attached to
 * a review or emailed. `hdf5` points at a file holding the samples and the
 * LOD pyramid over them, which is what a long run on a server wants: the
 * viewer asks for a window at a point budget and never moves the rest.
 */
export type GsimSimResultData =
  | { kind: "inline"; path?: undefined; pyramid?: boolean }
  | { kind: "hdf5"; path: string; pyramid?: boolean };

export interface GsimSimResultVector {
  name: string;
  unit: string;
  quantity?: string;
  domain?: "time" | "frequency" | "parameter";
  /** Required when data.kind is "inline". */
  encoding?: SampleEncoding;
  /** Required when data.kind is "inline". */
  data?: string | number[];
  /** Required when data.kind is "hdf5": the dataset key inside that file. */
  dataset?: string;
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
  schema_version: 2;
  run: GsimSimResultRun;
  data: GsimSimResultData;
  sweep: GsimSimResultVector;
  signals: GsimSimResultSignal[];
  layout?: { figures: GsimSimResultFigureLayout[] };
}
