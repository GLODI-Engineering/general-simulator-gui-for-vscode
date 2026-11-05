import type { SimulationManifest, WaveformSlice, WorkspaceVariable } from "../types";

export const STUB_WORKSPACE_VARIABLES: WorkspaceVariable[] = [
  { name: "t", value: 0.5, shape: [] },
  { name: "y", value: [1, 2, 3], shape: [3] },
  { name: "V_out", value: [3.2, 3.5, 3.7], shape: [3] },
];

export const STUB_MANIFEST: SimulationManifest = {
  sim_id: "stub-sim-1",
  signals: ["V_out", "I_L"],
  t_start: 0,
  t_end: 1,
};

export const STUB_WAVEFORM: WaveformSlice = {
  time: Array.from({ length: 64 }, (_, index) => index / 63),
  traces: [
    {
      label: "V_out",
      values: Array.from({ length: 64 }, (_, index) => 3.3 + Math.sin(index / 10) * 0.2),
    },
    {
      label: "I_L",
      values: Array.from({ length: 64 }, (_, index) => 1.1 + Math.cos(index / 9) * 0.15),
    },
  ],
};

export const STUB_EXECUTE_CHUNKS = ["line1\n", "line2\n", "line3\n"];
