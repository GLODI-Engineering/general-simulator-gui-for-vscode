/**
 * Kernel-sidecar process lifecycle, owned by the extension host.
 *
 * This is the Node-side replacement for what
 * `apps/desktop/src-tauri/src/main.rs` does in Rust: the host spawns the
 * sidecar, learns its port + token from the `KERNEL_READY` handshake on
 * stdout, hands that to every webview, and tears the child down on shutdown.
 */
import { type ChildProcess, spawn } from "node:child_process";
import * as readline from "node:readline";
import * as vscode from "vscode";

import { buildKernelEnvironment } from "./kernel-environment";

import {
  type KernelConfig,
  buildSpawnPlan,
  generateToken,
  kernelConfigFromEnv,
  parseKernelReady,
  resolveWorkspaceRoot,
} from "./kernel-core";

export type { KernelConfig };

/** Grace period before SIGKILL when shutting the sidecar down. */
const SHUTDOWN_GRACE_MS = 2_000;

export class KernelSidecar implements vscode.Disposable {
  private child: ChildProcess | null = null;
  private config: KernelConfig | null = null;
  private starting: Promise<KernelConfig | null> | null = null;

  private readonly onDidChangeEmitter = new vscode.EventEmitter<KernelConfig | null>();
  /** Fires with the new config on (re)start, and with `null` when the sidecar stops. */
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(private readonly log: vscode.OutputChannel) {}

  get current(): KernelConfig | null {
    return this.config;
  }

  /** Idempotent: concurrent callers share one in-flight start. */
  async start(): Promise<KernelConfig | null> {
    if (this.config) {
      return this.config;
    }
    if (this.starting) {
      return this.starting;
    }
    this.starting = this.doStart().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  async restart(): Promise<KernelConfig | null> {
    this.log.appendLine("[kernel] restart requested");
    await this.stop();
    return this.start();
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.config = null;
    this.onDidChangeEmitter.fire(null);
    if (!child || child.exitCode !== null || child.killed) {
      return;
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.log.appendLine("[kernel] SIGTERM timed out — sending SIGKILL");
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
        resolve();
      }, SHUTDOWN_GRACE_MS);
      child.once("exit", done);
      try {
        child.kill("SIGTERM");
      } catch {
        done();
      }
    });
    this.log.appendLine("[kernel] stopped");
  }

  private async doStart(): Promise<KernelConfig | null> {
    // Manual override (CI / dev-without-auto-spawn), same contract as Tauri.
    const fromEnv = kernelConfigFromEnv();
    if (fromEnv) {
      this.log.appendLine(`[kernel] using GENSIM_KERNEL_* override on port ${fromEnv.port}`);
      this.config = fromEnv;
      this.onDidChangeEmitter.fire(fromEnv);
      return fromEnv;
    }

    const settings = vscode.workspace.getConfiguration("generalSimulator");
    const configuredRoot = (settings.get<string>("workspaceRoot") ?? "").trim();
    const runner = (settings.get<string>("pythonRunner") ?? "uv").trim() || "uv";

    const candidates = configuredRoot
      ? [configuredRoot]
      : (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);

    const workspaceRoot = resolveWorkspaceRoot(candidates);
    if (!workspaceRoot) {
      this.log.appendLine(
        "[kernel] could not locate a general-simulator checkout (no pyproject.toml found). " +
          "Set generalSimulator.workspaceRoot.",
      );
      return null;
    }

    const token = generateToken();
    const plan = buildSpawnPlan(workspaceRoot, token, runner);

    const kernelEnv = buildKernelEnvironment({
      base: process.env,
      workspaceRoot,
      settings: {
        generalSimulatorPath: settings.get<string>("generalSimulatorPath"),
        ngspicePath: settings.get<string>("ngspicePath"),
        xycePath: settings.get<string>("xycePath"),
        octaveCliPath: settings.get<string>("octaveCliPath"),
        pythonPath: settings.get<string[]>("pythonPath"),
        environment: settings.get<Record<string, string>>("environment"),
      },
    });

    this.log.appendLine(`[kernel] spawning: ${plan.command} ${plan.args.join(" ")}`);
    // Names only. A value can be an absolute path a user would rather not have
    // in a log they paste into an issue.
    const configured = Object.keys(kernelEnv).filter(
      (key) => key.startsWith("GENSIM_") || key === "PYTHONPATH",
    );
    if (configured.length > 0) {
      this.log.appendLine(`[kernel] environment from settings: ${configured.sort().join(", ")}`);
    }

    let child: ChildProcess;
    try {
      child = spawn(plan.command, plan.args, {
        cwd: plan.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        // Previously omitted, so the kernel inherited whatever the editor
        // happened to have and no setting could reach the solver it starts.
        env: kernelEnv,
      });
    } catch (error) {
      this.log.appendLine(`[kernel] spawn failed: ${String(error)}`);
      return null;
    }
    this.child = child;

    child.stderr?.on("data", (chunk: Buffer) => {
      this.log.append(`[kernel:stderr] ${chunk.toString()}`);
    });
    child.on("error", (error) => {
      this.log.appendLine(`[kernel] process error: ${error.message}`);
    });
    child.on("exit", (code, signal) => {
      this.log.appendLine(`[kernel] exited (code=${code} signal=${signal})`);
      if (this.child === child) {
        this.child = null;
        this.config = null;
        this.onDidChangeEmitter.fire(null);
      }
    });

    const ready = await this.awaitReady(child);
    if (!ready) {
      this.log.appendLine("[kernel] never signalled KERNEL_READY");
      return null;
    }
    this.log.appendLine(`[kernel] ready on port ${ready.port}`);
    this.config = ready;
    this.onDidChangeEmitter.fire(ready);
    return ready;
  }

  /** Resolves on the KERNEL_READY handshake line, or null if the child dies first. */
  private awaitReady(child: ChildProcess): Promise<KernelConfig | null> {
    return new Promise((resolve) => {
      if (!child.stdout) {
        resolve(null);
        return;
      }
      const rl = readline.createInterface({ input: child.stdout });
      let settled = false;
      const finish = (value: KernelConfig | null) => {
        if (settled) return;
        settled = true;
        rl.close();
        resolve(value);
      };
      rl.on("line", (line) => {
        const parsed = parseKernelReady(line);
        if (parsed) {
          finish(parsed);
        } else if (line.trim()) {
          this.log.appendLine(`[kernel:stdout] ${line}`);
        }
      });
      child.once("exit", () => finish(null));
      child.once("error", () => finish(null));
    });
  }

  dispose(): void {
    void this.stop();
    this.onDidChangeEmitter.dispose();
  }
}
