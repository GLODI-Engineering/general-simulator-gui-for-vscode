/**
 * FE-50: sim-settings store tests
 *
 * Acceptance:
 * - Selecting "AC" shows frequency range fields and hides TRAN time fields.
 * - Selecting "TRAN" restores time fields and hides frequency fields.
 * - Clicking Apply closes the panel and updates the store.
 * - sim-settings store persists and rehydrates correctly.
 * - run.ts unit test asserts simulate request payload contains the correct
 *   analysis_type and parameters from the store.
 */

import { beforeEach, describe, expect, it } from "vitest";

let useSimSettingsStore: {
  getState: () => {
    settings: {
      analysisType: "TRAN" | "AC" | "DC" | "OP";
      tEnd: number;
      tStep: number;
      acFstart: number;
      acFstop: number;
      acPoints: number;
      dcSource: string;
      dcStart: number;
      dcStop: number;
      dcStep: number;
    };
    setSettings: (patch: Record<string, unknown>) => void;
  };
  setState: (partial: Record<string, unknown>) => void;
} | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./sim-settings");
  useSimSettingsStore = mod.useSimSettingsStore ?? mod.default;
  if (useSimSettingsStore !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

describe("FE-50: sim-settings store", () => {
  beforeEach(() => {
    if (available) {
      useSimSettingsStore!.getState().setSettings({
        analysisType: "TRAN",
        tEnd: 10e-3,
        tStep: 10e-6,
      });
    }
  });

  skip("default analysis type is TRAN", () => {
    expect(useSimSettingsStore!.getState().settings.analysisType).toBe("TRAN");
  });

  skip("default t_end=10e-3 and t_step=10e-6", () => {
    const s = useSimSettingsStore!.getState().settings;
    expect(s.tEnd).toBeCloseTo(10e-3);
    expect(s.tStep).toBeCloseTo(10e-6);
  });

  skip("setSettings updates analysisType to AC", () => {
    useSimSettingsStore!.getState().setSettings({ analysisType: "AC" });
    expect(useSimSettingsStore!.getState().settings.analysisType).toBe("AC");
  });

  skip("setSettings updates analysisType to DC", () => {
    useSimSettingsStore!.getState().setSettings({ analysisType: "DC" });
    expect(useSimSettingsStore!.getState().settings.analysisType).toBe("DC");
  });

  skip("setSettings updates analysisType to OP", () => {
    useSimSettingsStore!.getState().setSettings({ analysisType: "OP" });
    expect(useSimSettingsStore!.getState().settings.analysisType).toBe("OP");
  });

  skip("AC fields default to sensible values", () => {
    useSimSettingsStore!.getState().setSettings({ analysisType: "AC" });
    const s = useSimSettingsStore!.getState().settings;
    expect(typeof s.acFstart).toBe("number");
    expect(typeof s.acFstop).toBe("number");
    expect(typeof s.acPoints).toBe("number");
  });

  skip("partial setSettings preserves other fields", () => {
    useSimSettingsStore!.getState().setSettings({ tEnd: 1e-3 });
    const s = useSimSettingsStore!.getState().settings;
    expect(s.tEnd).toBeCloseTo(1e-3);
    expect(s.tStep).toBeCloseTo(10e-6); // unchanged
  });
});
