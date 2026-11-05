/**
 * Pure, VS Code-free half of the kernel-sidecar process manager.
 *
 * Faithful port of `apps/desktop/src-tauri/src/main.rs`:
 *   - locate the workspace root by walking up until `pyproject.toml`,
 *   - spawn `uv run --project <root> python -m kernel_sidecar
 *     --port 0 --token <hex> --connect-timeout 0`,
 *   - read the child's stdout until a `KERNEL_READY port=… token=…` line,
 *   - honour the `GENSIM_KERNEL_PORT` / `GENSIM_KERNEL_TOKEN` overrides used by
 *     CI and dev-without-auto-spawn.
 *
 * Everything here is dependency-free so it can be unit tested without a
 * running VS Code instance.
 */
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export interface KernelConfig {
  port: number;
  token: string;
}

export interface SpawnPlan {
  command: string;
  args: string[];
  cwd: string;
}

/** Maximum number of parent directories walked when locating the workspace. */
export const WORKSPACE_SEARCH_DEPTH = 12;

/**
 * 32 hex chars, matching the Rust token shape. The Rust implementation derived
 * the value from the clock and pid; a CSPRNG is strictly better and the token
 * is only ever compared for equality by the sidecar.
 */
export function generateToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Walk up from `startDir` looking for the directory containing `pyproject.toml`.
 * `exists` is injectable so tests do not need a real tree on disk.
 */
export function findWorkspaceRoot(
  startDir: string,
  exists: (candidate: string) => boolean = fs.existsSync,
): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i < WORKSPACE_SEARCH_DEPTH; i += 1) {
    if (exists(path.join(dir, "pyproject.toml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

/** First workspace root discoverable from any of `startDirs`. */
export function resolveWorkspaceRoot(
  startDirs: readonly string[],
  exists: (candidate: string) => boolean = fs.existsSync,
): string | null {
  for (const dir of startDirs) {
    const found = findWorkspaceRoot(dir, exists);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Build the spawn plan. Mirrors `spawn_kernel()` in main.rs, including the
 * `--port 0` (let the OS pick) and `--connect-timeout 0` (never self-exit)
 * flags, and running with the workspace root as the working directory.
 *
 * One deliberate divergence: `--package kernel-sidecar` is added. The Rust
 * command (`uv run --project <root> python -m kernel_sidecar`) resolves the
 * root project's environment, which does not depend on the `kernel-sidecar`
 * uv workspace member — so it fails with `No module named kernel_sidecar`
 * (reproduced against this checkout). `--package` selects the member whose
 * environment actually contains it. The Tauri shell has the same bug.
 */
export function buildSpawnPlan(workspaceRoot: string, token: string, runner = "uv"): SpawnPlan {
  if (runner === "uv") {
    return {
      command: "uv",
      args: [
        "run",
        "--project",
        workspaceRoot,
        "--package",
        "kernel-sidecar",
        "python",
        "-m",
        "kernel_sidecar",
        "--port",
        "0",
        "--token",
        token,
        "--connect-timeout",
        "0",
      ],
      cwd: workspaceRoot,
    };
  }
  // Any other runner is treated as a bare Python interpreter.
  return {
    command: runner,
    args: ["-m", "kernel_sidecar", "--port", "0", "--token", token, "--connect-timeout", "0"],
    cwd: workspaceRoot,
  };
}

/**
 * Parse a `KERNEL_READY port=<n> token=<hex>` handshake line.
 * Returns null for any other line.
 */
export function parseKernelReady(line: string): KernelConfig | null {
  const rest = line.startsWith("KERNEL_READY ") ? line.slice("KERNEL_READY ".length) : null;
  if (rest === null) {
    return null;
  }
  let port: number | null = null;
  let token: string | null = null;
  for (const part of rest.split(/\s+/)) {
    if (part.startsWith("port=")) {
      const parsed = Number.parseInt(part.slice("port=".length), 10);
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
        port = parsed;
      }
    } else if (part.startsWith("token=")) {
      token = part.slice("token=".length);
    }
  }
  return port !== null && token !== null ? { port, token } : null;
}

/**
 * Manual override for CI / dev-without-auto-spawn, matching the
 * `GENSIM_KERNEL_PORT` + `GENSIM_KERNEL_TOKEN` pair honoured by the Tauri shell.
 * Both must be present.
 */
export function kernelConfigFromEnv(env: NodeJS.ProcessEnv = process.env): KernelConfig | null {
  const rawPort = env.GENSIM_KERNEL_PORT;
  const token = env.GENSIM_KERNEL_TOKEN;
  if (!rawPort || !token) {
    return null;
  }
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return null;
  }
  return { port, token };
}
