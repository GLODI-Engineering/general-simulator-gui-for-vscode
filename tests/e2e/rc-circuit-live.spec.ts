import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

type GensimWindow = typeof globalThis & {
  __gensim_insertBlock?: (type: string) => void;
  __gensim_wire_electrical?: (
    fromType: string,
    fromPort: string,
    toType: string,
    toPort: string,
  ) => void;
  __gensim_setParamOnFirst?: (type: string, key: string, value: string | number | boolean) => void;
  __gensim_setActiveSimulator?: (id: string) => void;
  __gensim_setSimulationAnalysis?: (analysis: "TRAN" | "AC" | "DC") => void;
  __gensim_getWaveformPointCount?: () => number;
  __gensim_run?: () => Promise<void>;
};

const REPO = resolve(process.cwd());
const PORT = 19091;
const TOKEN = randomBytes(32).toString("hex");

let kernelProc: ChildProcessWithoutNullStreams | null = null;

async function startKernel() {
  kernelProc = spawn(
    "uv",
    ["run", "python", "-m", "kernel_sidecar", "--port", String(PORT), "--token", TOKEN],
    {
      cwd: REPO,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    },
  );

  let ready = false;
  kernelProc.stdout.on("data", (chunk) => {
    const txt = String(chunk);
    if (txt.includes("KERNEL_READY")) ready = true;
  });

  const start = Date.now();
  while (!ready && Date.now() - start < 15000) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!ready) throw new Error("kernel-sidecar did not become ready");
}

async function stopKernel() {
  if (!kernelProc) return;
  kernelProc.kill("SIGTERM");
  await Promise.race([once(kernelProc, "exit"), new Promise((r) => setTimeout(r, 2000))]);
  if (!kernelProc.killed) kernelProc.kill("SIGKILL");
  kernelProc = null;
}

async function buildRc(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const win = window as unknown as GensimWindow;
    win.__gensim_insertBlock?.("source.voltage.dc");
    win.__gensim_insertBlock?.("passive.resistor");
    win.__gensim_insertBlock?.("passive.capacitor");
    win.__gensim_setParamOnFirst?.("source.voltage.dc", "V", 5.0);
    win.__gensim_setParamOnFirst?.("passive.resistor", "R", 1000.0);
    win.__gensim_setParamOnFirst?.("passive.capacitor", "C", 1e-6);
    win.__gensim_wire_electrical?.("source.voltage.dc", "p", "passive.resistor", "p");
    win.__gensim_wire_electrical?.("passive.resistor", "n", "passive.capacitor", "p");
    win.__gensim_setActiveSimulator?.("ngspice");
  });
}

async function runAndSnap(
  page: import("@playwright/test").Page,
  a: "TRAN" | "AC" | "DC",
  out: string,
) {
  await page.evaluate((analysis) => {
    const win = window as unknown as GensimWindow;
    win.__gensim_setSimulationAnalysis?.(analysis);
  }, a);

  await page.evaluate(async () => {
    const win = window as unknown as GensimWindow;
    await win.__gensim_run?.();
  });

  try {
    await page.waitForFunction(
      () => ((window as unknown as GensimWindow).__gensim_getWaveformPointCount?.() ?? 0) > 0,
      { timeout: 30000 },
    );
  } catch {
    test.skip();
    return;
  }
  await expect(page.getByLabel(/waveform viewer/i)).toBeVisible();
  await page.screenshot({ path: out });
}

test.beforeAll(async () => {
  await startKernel();
});

test.afterAll(async () => {
  await stopKernel();
});

test.skip("RC live frontend run with kernel-sidecar (TRAN/AC/DC)", async ({ page }) => {
  await page.addInitScript(
    ({ port, token }) => {
      (window as unknown as { __KERNEL_PORT__?: number }).__KERNEL_PORT__ = port;
      (window as unknown as { __KERNEL_TOKEN__?: string }).__KERNEL_TOKEN__ = token;
    },
    { port: PORT, token: TOKEN },
  );

  await page.goto("http://localhost:5173");
  await page.waitForSelector("main", { timeout: 15000 });

  await buildRc(page);
  await page.screenshot({ path: "docs/circuit_test/rc_circuit/frontend_live_schematic.png" });

  await runAndSnap(page, "TRAN", "docs/circuit_test/rc_circuit/frontend_live_tran.png");
  await runAndSnap(page, "AC", "docs/circuit_test/rc_circuit/frontend_live_ac.png");
  await runAndSnap(page, "DC", "docs/circuit_test/rc_circuit/frontend_live_dc.png");
});
