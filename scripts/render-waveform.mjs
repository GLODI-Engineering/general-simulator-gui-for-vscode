#!/usr/bin/env node
/**
 * Render the waveform viewer to a PNG so a human (or an agent) can *look* at it.
 *
 * Same reasoning as scripts/render-schematic.mjs: plot quality is a
 * correctness property (AGENTS.md invariant 6) and the one property unit
 * tests cannot check. No assertion notices that the legend is a dark bar on
 * a white chart, that the grid out-weighs the data, that two traces are the
 * same blue, or that tick labels collide.
 *
 * It drives the real `waveform.html` bundle — the same entry the VS Code
 * panel hosts — and seeds it through `window.__gensim_load_waveform`
 * (src/waveform/render-hook.ts), so no kernel sidecar is needed.
 *
 * Usage:
 *   node scripts/render-waveform.mjs
 *   node scripts/render-waveform.mjs --case bode --theme dark --out /tmp/bode.png
 *
 * Flags:
 *   --case <name>    buck (default) | bode | dense
 *   --out <path>     output PNG (default: render-out/waveform-<case>-<theme>.png)
 *   --width/--height viewport size (default 1400x900)
 *   --theme          light | dark (default light)
 *   --keep-server    leave the preview server running for a follow-up render
 *   --base <url>     use an already-running server instead of starting one
 */

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW_HOST = "127.0.0.1";
const PREVIEW_PORT = 5173;
const DEFAULT_BASE = `http://${PREVIEW_HOST}:${PREVIEW_PORT}`;

function parseArgs(argv) {
  const args = { width: 1400, height: 900, theme: "light", case: "buck" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--case":
        args.case = value;
        i += 1;
        break;
      case "--out":
        args.out = value;
        i += 1;
        break;
      case "--width":
        args.width = Number(value);
        i += 1;
        break;
      case "--height":
        args.height = Number(value);
        i += 1;
        break;
      case "--theme":
        args.theme = value;
        i += 1;
        break;
      case "--base":
        args.base = value;
        i += 1;
        break;
      case "--keep-server":
        args.keepServer = true;
        break;
      default:
        if (flag?.startsWith("--")) throw new Error(`unknown flag: ${flag}`);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Fixtures. Deliberately shaped like real power-electronics results: hard
// switching edges, a triangular ripple riding a DC level, a small output
// ripple on a large offset, and two different units sharing one axes — the
// cases where a plot's styling either holds up or does not.
// ---------------------------------------------------------------------------

/** A buck converter mid-transient: 100 kHz switching, 2 ms of it. */
function buckCase() {
  const fsw = 100e3;
  const dt = 2e-8;
  const n = Math.round(2e-3 / dt);
  const x = new Array(n);
  const vsw = new Array(n);
  const il = new Array(n);
  const vout = new Array(n);

  let iL = 0;
  let vO = 0;
  const vin = 48;
  const d = 0.25;
  const L = 22e-6;
  const C = 100e-6;
  const R = 1.2;

  for (let k = 0; k < n; k += 1) {
    const t = k * dt;
    const phase = (t * fsw) % 1;
    const on = phase < d;
    // A real switch node is not a perfect square: it has finite edges.
    const edge = Math.min(1, Math.abs(phase - (on ? 0 : d)) / 0.004);
    const node = on ? vin * edge : -0.7 * edge;
    const dIL = ((node - vO) / L) * dt;
    iL += dIL;
    vO += ((iL - vO / R) / C) * dt;
    x[k] = t;
    vsw[k] = node;
    il[k] = iL;
    vout[k] = vO;
  }

  return {
    simId: "buck",
    signals: [
      { name: "V(sw)", unit: "V", quantity: "voltage", x, y: vsw },
      { name: "V(out)", unit: "V", quantity: "voltage", x, y: vout },
      { name: "I(L1)", unit: "A", quantity: "current", x, y: il },
    ],
    figures: [
      {
        name: "Buck converter",
        rows: 2,
        cols: 1,
        axes: [
          { row: 0, col: 0, signals: ["V(sw)", "V(out)"] },
          { row: 1, col: 0, signals: ["I(L1)", "V(out)"], cursorA: 4e-4, cursorB: 1.4e-3 },
        ],
      },
    ],
  };
}

/** A loop-gain Bode pair, to exercise the log x-axis and dB/deg spines. */
function bodeCase() {
  const n = 400;
  const x = new Array(n);
  const mag = new Array(n);
  const phase = new Array(n);
  const fp1 = 120;
  const fp2 = 40e3;
  const dcGain = 46;
  for (let k = 0; k < n; k += 1) {
    const f = 10 ** (1 + (4.5 * k) / (n - 1));
    const w1 = f / fp1;
    const w2 = f / fp2;
    x[k] = f;
    mag[k] = dcGain - 10 * Math.log10(1 + w1 * w1) - 10 * Math.log10(1 + w2 * w2);
    phase[k] = -(Math.atan(w1) + Math.atan(w2)) * (180 / Math.PI);
  }
  return {
    simId: "loop",
    signals: [
      {
        name: "loop gain",
        unit: "dB",
        quantity: "dB",
        analysis: "ac_mag",
        domain: "frequency",
        x,
        y: mag,
      },
      {
        name: "loop phase",
        unit: "deg",
        quantity: "deg",
        analysis: "ac_phase",
        domain: "frequency",
        x,
        y: phase,
      },
    ],
    figures: [
      {
        name: "Loop gain",
        rows: 2,
        cols: 1,
        axes: [
          { row: 0, col: 0, signals: ["loop gain"] },
          { row: 1, col: 0, signals: ["loop phase"] },
        ],
      },
    ],
  };
}

/** Eight traces on one axes — the case where a palette either separates or does not. */
function denseCase() {
  const n = 4000;
  const x = new Array(n);
  const series = Array.from({ length: 8 }, () => new Array(n));
  for (let k = 0; k < n; k += 1) {
    const t = (k / (n - 1)) * 0.04;
    x[k] = t;
    for (let s = 0; s < 8; s += 1) {
      series[s][k] = Math.sin(2 * Math.PI * 50 * t - (s * Math.PI) / 4) * (1 - s * 0.06);
    }
  }
  return {
    simId: "dense",
    signals: series.map((y, s) => ({
      name: `V(ph${s + 1})`,
      unit: "V",
      quantity: "voltage",
      x,
      y,
    })),
    figures: [
      {
        name: "Eight phases",
        rows: 1,
        cols: 1,
        axes: [{ row: 0, col: 0, signals: series.map((_, s) => `V(ph${s + 1})`) }],
      },
    ],
  };
}

/**
 * The same converter re-run three times with the compensator moved, which
 * is what the history overlay exists for: seeing what a change did.
 */
function historyCase() {
  const n = 3000;
  const tEnd = 3e-3;
  const run = (zeta, name) => {
    const x = new Array(n);
    const vout = new Array(n);
    const il = new Array(n);
    const wn = 2 * Math.PI * 1500;
    for (let k = 0; k < n; k += 1) {
      const t = (k / (n - 1)) * tEnd;
      const env = Math.exp(-zeta * wn * t);
      const wd = wn * Math.sqrt(Math.max(1e-9, 1 - zeta * zeta));
      x[k] = t;
      vout[k] = 12 * (1 - env * Math.cos(wd * t));
      il[k] = 10 * env * Math.sin(wd * t) + 8;
    }
    return {
      simId: name,
      signals: [
        { name: "V(out)", unit: "V", quantity: "voltage", x, y: vout },
        { name: "I(L1)", unit: "A", quantity: "current", x, y: il },
      ],
    };
  };

  const current = run(0.7, "run-3");
  return {
    simId: current.simId,
    signals: current.signals,
    history: [run(0.35, "run-2"), run(0.15, "run-1")],
    historyDepth: 2,
    figures: [
      {
        name: "Compensator sweep",
        rows: 1,
        cols: 1,
        axes: [{ row: 0, col: 0, signals: ["V(out)", "I(L1)"] }],
      },
    ],
  };
}

const CASES = { buck: buckCase, bode: bodeCase, dense: denseCase, history: historyCase };

async function startPreview() {
  const child = spawn(
    "pnpm",
    [
      "--filter",
      "@gensim/frontend",
      "preview",
      "--host",
      PREVIEW_HOST,
      "--port",
      String(PREVIEW_PORT),
      "--strictPort",
    ],
    { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "";
  child.stdout.on("data", (d) => {
    log += d.toString();
  });
  child.stderr.on("data", (d) => {
    log += d.toString();
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(DEFAULT_BASE, { method: "HEAD" });
      if (res.ok || res.status === 404) return child;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill();
  throw new Error(`preview server never came up:\n${log}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const build = CASES[args.case];
  if (!build)
    throw new Error(`unknown --case: ${args.case} (have: ${Object.keys(CASES).join(", ")})`);
  const spec = build();

  const outPath = path.resolve(
    REPO_ROOT,
    args.out ?? path.join("render-out", `waveform-${args.case}-${args.theme}.png`),
  );
  mkdirSync(path.dirname(outPath), { recursive: true });

  let server = null;
  const base = args.base ?? DEFAULT_BASE;
  if (!args.base) {
    let alreadyUp = false;
    try {
      const probe = await fetch(DEFAULT_BASE, { method: "HEAD" });
      alreadyUp = probe.ok || probe.status === 404;
    } catch {
      alreadyUp = false;
    }
    if (!alreadyUp) server = await startPreview();
  }

  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    browser = await chromium.launch({ channel: "chrome" });
  }
  try {
    const page = await browser.newPage({
      viewport: { width: args.width, height: args.height },
      deviceScaleFactor: 2,
    });

    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto(`${base}/waveform.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate((theme) => {
      document.documentElement.setAttribute("data-theme", theme);
    }, args.theme);

    await page.waitForFunction(() => typeof globalThis.__gensim_load_waveform === "function", {
      timeout: 20_000,
    });
    await page.evaluate((s) => globalThis.__gensim_load_waveform(s), spec);
    // uPlot draws on a rAF after React commits; two frames plus a margin.
    await page.waitForTimeout(900);

    await page.screenshot({ path: outPath });

    const points = spec.signals.reduce((sum, s) => sum + s.x.length, 0);
    console.log(
      `rendered ${spec.signals.length} signals / ${points} points (${args.case}, ${args.theme}) -> ${outPath}`,
    );
    if (errors.length > 0) {
      console.log(`\npage errors (${errors.length}):`);
      for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
    }
  } finally {
    await browser.close();
    if (server && !args.keepServer) server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
