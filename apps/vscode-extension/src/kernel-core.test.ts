import { describe, expect, it } from "vitest";

import {
  buildSpawnPlan,
  findWorkspaceRoot,
  generateToken,
  kernelConfigFromEnv,
  parseKernelReady,
  resolveWorkspaceRoot,
} from "./kernel-core";

describe("kernel-core: KERNEL_READY handshake", () => {
  it("parses the port and token the sidecar prints", () => {
    expect(parseKernelReady("KERNEL_READY port=51234 token=deadbeef")).toEqual({
      port: 51234,
      token: "deadbeef",
    });
  });

  it("tolerates extra fields and extra whitespace", () => {
    expect(parseKernelReady("KERNEL_READY  pid=99  port=1  token=t  extra=x")).toEqual({
      port: 1,
      token: "t",
    });
  });

  it("returns null for unrelated stdout lines", () => {
    expect(parseKernelReady("INFO starting up")).toBeNull();
    expect(parseKernelReady("")).toBeNull();
  });

  it("returns null when either half is missing or out of range", () => {
    expect(parseKernelReady("KERNEL_READY port=51234")).toBeNull();
    expect(parseKernelReady("KERNEL_READY token=abc")).toBeNull();
    expect(parseKernelReady("KERNEL_READY port=0 token=abc")).toBeNull();
    expect(parseKernelReady("KERNEL_READY port=70000 token=abc")).toBeNull();
  });
});

describe("kernel-core: spawn plan", () => {
  it("matches the Tauri shell's uv invocation, plus --package kernel-sidecar", () => {
    const plan = buildSpawnPlan("/repo", "tok");
    expect(plan).toEqual({
      command: "uv",
      args: [
        "run",
        "--project",
        "/repo",
        "--package",
        "kernel-sidecar",
        "python",
        "-m",
        "kernel_sidecar",
        "--port",
        "0",
        "--token",
        "tok",
        "--connect-timeout",
        "0",
      ],
      cwd: "/repo",
    });
  });

  it("falls back to a bare interpreter for a non-uv runner", () => {
    const plan = buildSpawnPlan("/repo", "tok", "python3");
    expect(plan.command).toBe("python3");
    expect(plan.args.slice(0, 2)).toEqual(["-m", "kernel_sidecar"]);
    expect(plan.args).toContain("--connect-timeout");
    expect(plan.cwd).toBe("/repo");
  });
});

describe("kernel-core: workspace discovery", () => {
  const tree = new Set(["/a/b/pyproject.toml"]);
  const exists = (candidate: string) => tree.has(candidate);

  it("walks up to the directory holding pyproject.toml", () => {
    expect(findWorkspaceRoot("/a/b/c/d", exists)).toBe("/a/b");
  });

  it("returns null when nothing matches", () => {
    expect(findWorkspaceRoot("/x/y", exists)).toBeNull();
  });

  it("stops after 12 levels", () => {
    const deep = `/${"deep/".repeat(20)}leaf`;
    expect(findWorkspaceRoot(deep, exists)).toBeNull();
  });

  it("takes the first candidate that resolves", () => {
    expect(resolveWorkspaceRoot(["/x/y", "/a/b/c"], exists)).toBe("/a/b");
  });
});

describe("kernel-core: env override", () => {
  it("honours the GENSIM_KERNEL_* pair", () => {
    expect(kernelConfigFromEnv({ GENSIM_KERNEL_PORT: "9001", GENSIM_KERNEL_TOKEN: "t" })).toEqual({
      port: 9001,
      token: "t",
    });
  });

  it("requires both halves", () => {
    expect(kernelConfigFromEnv({ GENSIM_KERNEL_PORT: "9001" })).toBeNull();
    expect(kernelConfigFromEnv({ GENSIM_KERNEL_TOKEN: "t" })).toBeNull();
    expect(kernelConfigFromEnv({})).toBeNull();
  });

  it("rejects a non-numeric port", () => {
    expect(
      kernelConfigFromEnv({ GENSIM_KERNEL_PORT: "nope", GENSIM_KERNEL_TOKEN: "t" }),
    ).toBeNull();
  });
});

describe("kernel-core: token", () => {
  it("produces the 32 hex chars the sidecar expects", () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(generateToken()).not.toBe(token);
  });
});
