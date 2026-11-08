/**
 * Message protocol between the General Simulator webviews and the VS Code
 * extension host.
 *
 * This file is mirrored by `apps/vscode-extension/src/protocol.ts`. The two
 * apps are built separately (Vite bundle vs. plain `tsc` for the Node
 * extension host), so the shapes are duplicated rather than shared through a
 * workspace package. Keep both copies in sync.
 */

/** Which surface a webview is hosting. */
export type WebviewRole = "schematic" | "library" | "waveform" | "results";

export interface KernelConfig {
  port: number;
  token: string;
}

/** Injected into every webview as `window.__GSIM_INIT__` before the bundle runs. */
export interface WebviewInit {
  role: WebviewRole;
  /** Present for the schematic custom editor: the `.gsim_sch` file's URI string. */
  documentUri?: string;
  /** Present for the schematic custom editor: the on-disk document contents. */
  documentText?: string;
  /** Absent until the kernel sidecar signals ready. */
  kernel?: KernelConfig;
  /** User-authored components read from the workspace before React mounts. */
  userSymbols?: unknown[];
  /**
   * Set only by the @vscode/test-electron integration harness. Installs the
   * `gsim/test/exec` handler so the extension host can drive this webview's
   * real DOM and stores from an integration test.
   */
  testMode?: boolean;
}

// ---------------------------------------------------------------------------
// webview -> extension host
// ---------------------------------------------------------------------------

export type HostBoundMessage =
  /** The webview finished mounting and is ready to receive host messages. */
  | { type: "gsim/ready"; role: WebviewRole }
  /** Restart the kernel sidecar child process. Replaces Tauri's invoke(). */
  | { type: "gsim/restartKernel" }
  /**
   * The in-app File actions, handed off to VS Code when the app runs inside a
   * Custom Editor. VS Code — not this app's storage adapter — owns the
   * document lifecycle there, so New/Open/Save/Close become requests for the
   * workbench's own commands. See `file/host-file-actions.ts`.
   */
  | { type: "gsim/newSchematic" }
  | { type: "gsim/openSchematic" }
  | { type: "gsim/saveDocument"; as?: boolean }
  | { type: "gsim/closeDocument" }
  /** The schematic document was edited in the webview; marks the editor dirty. */
  | { type: "gsim/documentChanged"; text: string; label: string }
  /** Reply to a `gsim/requestDocument`. */
  | { type: "gsim/documentContent"; requestId: string; text: string }
  /** A library-item drag began; the host brokers the payload to other webviews. */
  | { type: "gsim/dragStart"; blockName: string; label: string }
  /** The library-item drag ended (dropped or cancelled). */
  | { type: "gsim/dragEnd" }
  /** Click-to-insert from the library sidebar into the active schematic editor. */
  | { type: "gsim/insertBlock"; blockName: string }
  /** A simulation finished; carries the sim id the waveform panel should attach to. */
  | { type: "gsim/simulationFinished"; simId: string }
  /**
   * Persist an authored component to `.gsim/symbols/<name>.gsim_sym` in the
   * workspace. Without this the symbol editor's output lived only in the
   * running catalog and was lost on reload.
   */
  | { type: "gsim/saveSymbol"; name: string; metadata: unknown }
  /**
   * Read a scripted block's source, so the editor can show what ports it
   * looks like it expects. The host confines the path to the workspace.
   */
  | { type: "gsim/readSource"; requestId: string; path: string }
  /** Open the waveform panel. */
  | { type: "gsim/showWaveforms" }
  | { type: "gsim/log"; level: "info" | "warn" | "error"; message: string }
  /** Integration-harness only: reply to a `gsim/test/exec`. */
  | { type: "gsim/test/report"; requestId: string; ok: boolean; result: unknown };

// ---------------------------------------------------------------------------
// extension host -> webview
// ---------------------------------------------------------------------------

export type WebviewBoundMessage =
  /** Kernel sidecar became ready (or was restarted on a new port). */
  | { type: "gsim/kernelConfig"; kernel: KernelConfig }
  /** Kernel sidecar went away; the webview should fall back / show a warning. */
  | { type: "gsim/kernelStopped" }
  /** Replace the schematic document (initial load, revert, external file change). */
  | { type: "gsim/setDocument"; text: string }
  /** Host asks the webview to serialise its current document (save / backup). */
  | { type: "gsim/requestDocument"; requestId: string }
  /**
   * Cross-webview drag bridge: the extension host broadcasts the block being
   * dragged out of the library view so the schematic webview can complete the
   * drop. `blockName: null` means the drag ended.
   */
  | { type: "gsim/dragState"; blockName: string | null; label?: string }
  /** Insert a block into this schematic editor (relayed library click). */
  | { type: "gsim/insertBlock"; blockName: string }
  /** Waveform panel should show the results of this sim id. */
  | { type: "gsim/showSimulation"; simId: string }
  /** The workspace's user components changed — merge them into the catalog. */
  | { type: "gsim/userSymbols"; metadata: unknown[] }
  /** A component was written to disk; carries the file it landed in. */
  | { type: "gsim/symbolSaved"; name: string; path: string }
  /** Answer to `gsim/readSource`: the file's text, or why it could not be read. */
  | { type: "gsim/sourceContent"; requestId: string; text?: string; error?: string }
  | { type: "gsim/symbolSaveFailed"; name: string; reason: string }
  /** Integration-harness only: run a probe inside this webview. */
  | { type: "gsim/test/exec"; requestId: string; op: string; args?: Record<string, unknown> };

export const GSIM_INIT_GLOBAL = "__GSIM_INIT__";
