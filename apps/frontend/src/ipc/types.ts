export type BinaryDType = "float32" | "float64" | "int16";

export interface WorkspaceVariable {
  name: string;
  value: unknown;
  shape: number[];
}

export interface WaveformTrace {
  label: string;
  values: number[];
  /** BE-47 signal metadata, carried through from the manifest entry so the
   * waveform viewer can tell AC/DC/noise results apart from transient ones
   * (axis labels, Bode-mode detection, unit display). Optional because
   * fixtures/tests may omit it; consumers should fall back sensibly. */
  analysis?: string;
  quantity?: string;
  unit?: string;
  domain?: string;
  /**
   * The block and port this trace came from, as the manifest records them.
   *
   * What a trace *is* cannot be read off its name: `V_out` says nothing about
   * whether a solver computed it or a file source replayed it from a capture.
   * The block can be looked up in the document, and its type answers that.
   */
  block?: string;
  port?: string;
}

export interface WaveformSlice {
  time: number[];
  traces: WaveformTrace[];
}

/**
 * What the run says about one of its signals.
 *
 * `SimulationManifest.signals` is a list of names, which is all the viewer
 * needed while every signal was something the solver computed. It is not
 * enough to tell a measured capture from a computed trace, and the kernel has
 * always sent more than a name.
 */
export interface SignalDetail {
  name: string;
  /** The block that produced it, and which of its ports. */
  block?: string;
  port?: string;
  analysis?: string;
  quantity?: string;
  unit?: string;
  domain?: string;
}

export interface SimulationManifest {
  sim_id: string;
  signals: string[];
  t_start: number;
  t_end: number;
  /**
   * The same signals, with what the kernel knows about each.
   *
   * Optional, and in the same order as `signals` when present: a fixture or a
   * stub kernel that answers with names alone stays valid, and a consumer
   * that only wants names is unaffected.
   */
  details?: SignalDetail[];
}

export interface DcOpEntry {
  node_or_branch: string;
  quantity: string;
  value: number;
  unit: string;
}

export interface ExecuteResult {
  status?: string;
  manifest: SimulationManifest;
  chunks?: string[];
  dc_op_table?: DcOpEntry[];
}

export interface SimulateRequest {
  type: "simulate";
  model?: unknown;
  netlist?: string;
  solver?: string;
  analysis_type?: "TRAN" | "AC" | "DC" | "OP" | "NOISE";
  t_end?: number;
  t_step?: number;
  ac_fstart?: number;
  ac_fstop?: number;
  ac_points?: number;
  dc_source?: string;
  dc_start?: number;
  dc_stop?: number;
  dc_step?: number;
}

export interface BinaryFramePayload {
  dtype: BinaryDType;
  shape: number[];
  data: Float32Array | Float64Array | Int16Array;
}

export class CancelledError extends Error {
  constructor(message = "Request cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

export interface IpcClient {
  execute(payload: unknown): Promise<ExecuteResult>;
  cancel(id?: string): void;
  workspaceGet(name: string): Promise<WorkspaceVariable | null>;
  waveformGet(simId: string, signals: string[]): Promise<WaveformSlice>;
  subscribe(
    event: "workspace_update" | "kernel_status" | "execute_stream",
    listener: (payload: unknown) => void,
  ): () => void;
}
