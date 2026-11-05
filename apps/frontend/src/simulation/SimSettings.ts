export type AnalysisType = "TRAN" | "AC" | "DC" | "OP";

export interface SimSettings {
  analysisType: AnalysisType;
  tEnd: number;
  tStep: number;
  acFstart: number;
  acFstop: number;
  acPoints: number;
  dcSource: string;
  dcStart: number;
  dcStop: number;
  dcStep: number;
}

export const DEFAULT_SIM_SETTINGS: SimSettings = {
  analysisType: "TRAN",
  tEnd: 0.01,
  tStep: 1e-5,
  acFstart: 1,
  acFstop: 1e6,
  acPoints: 100,
  dcSource: "V1",
  dcStart: 0,
  dcStop: 5,
  dcStep: 0.1,
};

export function toAnalysisPayload(settings: SimSettings): Record<string, unknown> {
  switch (settings.analysisType) {
    case "TRAN":
      return { analysis_type: "TRAN", t_end: settings.tEnd, t_step: settings.tStep };
    case "AC":
      return {
        analysis_type: "AC",
        ac_fstart: settings.acFstart,
        ac_fstop: settings.acFstop,
        ac_points: settings.acPoints,
      };
    case "DC":
      return {
        analysis_type: "DC",
        dc_source: settings.dcSource,
        dc_start: settings.dcStart,
        dc_stop: settings.dcStop,
        dc_step: settings.dcStep,
      };
    case "OP":
      return { analysis_type: "OP" };
  }
}
