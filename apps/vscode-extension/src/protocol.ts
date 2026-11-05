/**
 * Message protocol between the General Simulator webviews and this extension
 * host.
 *
 * Mirrors `apps/frontend/src/ipc/vscode-protocol.ts`. The two apps build
 * separately (Vite bundle vs. plain `tsc` for the Node extension host), so the
 * shapes are duplicated rather than shared through a workspace package. Keep
 * both copies in sync.
 */

export type WebviewRole = "schematic" | "library" | "waveform";

export interface KernelConfig {
  port: number;
  token: string;
}

export interface WebviewInit {
  role: WebviewRole;
  documentUri?: string;
  documentText?: string;
  kernel?: KernelConfig;
  /**
   * Set only by the @vscode/test-electron integration harness (gated on the
   * GSIM_INTEGRATION_TEST env var). Installs `gsim/test/exec` probes in the
   * webview so an integration test can assert on its real DOM and stores.
   */
  testMode?: boolean;
}

export type HostBoundMessage =
  | { type: "gsim/ready"; role: WebviewRole }
  | { type: "gsim/restartKernel" }
  /**
   * In-app File actions handed off to the workbench when the frontend runs
   * inside the schematic Custom Editor. Mirrors `file/host-file-actions.ts`.
   */
  | { type: "gsim/newSchematic" }
  | { type: "gsim/openSchematic" }
  | { type: "gsim/saveDocument"; as?: boolean }
  | { type: "gsim/closeDocument" }
  | { type: "gsim/documentChanged"; text: string; label: string }
  | { type: "gsim/documentContent"; requestId: string; text: string }
  | { type: "gsim/dragStart"; blockName: string; label: string }
  | { type: "gsim/dragEnd" }
  | { type: "gsim/insertBlock"; blockName: string }
  | { type: "gsim/simulationFinished"; simId: string }
  | { type: "gsim/showWaveforms" }
  | { type: "gsim/log"; level: "info" | "warn" | "error"; message: string }
  | { type: "gsim/test/report"; requestId: string; ok: boolean; result: unknown };

export type WebviewBoundMessage =
  | { type: "gsim/kernelConfig"; kernel: KernelConfig }
  | { type: "gsim/kernelStopped" }
  | { type: "gsim/setDocument"; text: string }
  | { type: "gsim/requestDocument"; requestId: string }
  | { type: "gsim/dragState"; blockName: string | null; label?: string }
  | { type: "gsim/insertBlock"; blockName: string }
  | { type: "gsim/showSimulation"; simId: string }
  | { type: "gsim/test/exec"; requestId: string; op: string; args?: Record<string, unknown> };

export const GSIM_INIT_GLOBAL = "__GSIM_INIT__";

export function isHostBoundMessage(value: unknown): value is HostBoundMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    (value as { type: string }).type.startsWith("gsim/")
  );
}
