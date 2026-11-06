#!/usr/bin/env node
/**
 * Load a real `.gsim_sim_result` in the real viewer and measure whether it
 * stays usable.
 *
 * This drives `results.html` through the production path — the same entry
 * the Custom Editor hosts, seeded the same way, with `__GSIM_INIT__` set
 * before the bundle runs. So what it measures is what a user gets when they
 * double-click the file, not a synthetic approximation of it.
 *
 * What it reports, and why each one:
 *
 *   parse      decode + validate + build the store. Blocks everything.
 *   paint      first chart on screen after that. This is "did it open".
 *   zoom/pan   frame intervals while driving real wheel and drag events.
 *              The mean is not the number that matters — the worst frame is,
 *              because one 300 ms frame is what "it froze" means.
 *
 * Usage:
 *   node scripts/stress-waveform.mjs --file /path/to/run.gsim_sim_result
 *   node scripts/stress-waveform.mjs --file run.gsim_sim_result --shot out.png
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW_HOST = "127.0.0.1";
const PREVIEW_PORT = 5173;
const DEFAULT_BASE = `http://${PREVIEW_HOST}:${PREVIEW_PORT}`;

function parseArgs(argv) {
  const args = { width: 1600, height: 1000, theme: "light" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--file":
        args.file = value;
        i += 1;
        break;
      case "--shot":
        args.shot = value;
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
  if (!args.file) throw new Error("--file <path to .gsim_sim_result> is required");
  return args;
}

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

function stats(samples) {
  if (samples.length === 0) return { n: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    n: sorted.length,
    median: at(0.5),
    p95: at(0.95),
    worst: sorted[sorted.length - 1],
  };
}

function ms(value) {
  return value === undefined ? "—" : `${value.toFixed(1)} ms`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(REPO_ROOT, args.file);
  if (!existsSync(filePath)) throw new Error(`no such file: ${filePath}`);
  const text = readFileSync(filePath, "utf8");
  const sizeMb = statSync(filePath).size / 1e6;

  let server = null;
  const base = args.base ?? DEFAULT_BASE;
  if (!args.base) {
    let up = false;
    try {
      const probe = await fetch(DEFAULT_BASE, { method: "HEAD" });
      up = probe.ok || probe.status === 404;
    } catch {
      up = false;
    }
    if (!up) server = await startPreview();
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
      deviceScaleFactor: 1,
    });

    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    // Exactly what the Custom Editor hands the webview.
    await page.addInitScript(
      ([role, documentText]) => {
        window.__GSIM_INIT__ = { role, documentText };
        window.__gsim_marks = {};
        performance.mark("gsim-nav");
      },
      ["results", text],
    );

    const t0 = Date.now();
    await page.goto(`${base}/results.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate((theme) => {
      document.documentElement.setAttribute("data-theme", theme);
    }, args.theme);

    // "Opened" means a chart is on screen, not that the module finished.
    await page.waitForSelector(".axes-plot canvas", { timeout: 120_000 });
    const openMs = Date.now() - t0;

    const loadError = await page.$(".results-load-error");
    if (loadError) {
      throw new Error(`the viewer refused the file:\n${await loadError.textContent()}`);
    }

    const summary = await page.evaluate(() => ({
      figures: document.querySelectorAll(".axes-container").length,
      traces: document.querySelectorAll(".axes-legend__row").length,
    }));

    // --- interaction -------------------------------------------------------
    // Frame intervals are collected by a rAF loop running *while* the events
    // are dispatched, because the cost being measured is the redraw those
    // events provoke, not the event handler's own return.
    const plot = await page.$(".axes-plot");
    const box = await plot.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    async function record(action) {
      await page.evaluate(() => {
        window.__frames = [];
        let last = performance.now();
        window.__recording = true;
        const tick = (now) => {
          window.__frames.push(now - last);
          last = now;
          if (window.__recording) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await action();
      return page.evaluate(() => {
        window.__recording = false;
        // Drop the first interval: it spans the gap between arming the
        // recorder and the first event, and measures nothing.
        return window.__frames.slice(1);
      });
    }

    const fullView = await (async () => {
      await page.waitForTimeout(300);
      return page.evaluate(() => {
        const u = [...(globalThis.__gensim_charts?.values() ?? [])][0];
        if (!u) return null;
        const started = performance.now();
        u.setData(u.data, false);
        return { points: u.data[0]?.length ?? 0, redrawMs: performance.now() - started };
      });
    })();

    await page.mouse.move(cx, cy);
    const zoomIn = await record(async () => {
      for (let i = 0; i < 30; i += 1) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(16);
      }
    });
    // What is on screen after a deep zoom. A screenshot cannot answer this:
    // a trace drawn from 200 points stretched across 1500 px looks like a
    // trace, just a wrong one.
    await page.waitForTimeout(400); // let the debounced refine land
    const zoomed = await page.evaluate(() => {
      const u = [...(globalThis.__gensim_charts?.values() ?? [])][0];
      if (!u) return null;
      const span = (u.scales.x?.max ?? 0) - (u.scales.x?.min ?? 0);
      // Cost of one full redraw at this budget, which is what a weak
      // machine feels and what vsync-capped frame intervals hide.
      const started = performance.now();
      u.setData(u.data, false);
      return { points: u.data[0]?.length ?? 0, span, redrawMs: performance.now() - started };
    });

    const zoomOut = await record(async () => {
      for (let i = 0; i < 30; i += 1) {
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(16);
      }
    });
    const drag = await record(async () => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 0; i < 30; i += 1) {
        await page.mouse.move(cx - i * 8, cy);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
    });

    if (args.shot) {
      const out = path.resolve(REPO_ROOT, args.shot);
      mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out });
    }

    const rows = [
      ["open (parse + decode + first paint)", ms(openMs)],
      ["zoom in  — median / p95 / worst frame", fmt(stats(zoomIn))],
      ["zoom out — median / p95 / worst frame", fmt(stats(zoomOut))],
      ["pan      — median / p95 / worst frame", fmt(stats(drag))],
      [
        "zoomed in  — points / span / one redraw",
        zoomed
          ? `${zoomed.points} over ${zoomed.span.toPrecision(3)} s, ${ms(zoomed.redrawMs)}`
          : "—",
      ],
      [
        "full extent — points / one redraw",
        fullView ? `${fullView.points}, ${ms(fullView.redrawMs)}` : "—",
      ],
    ];
    console.log(
      `\n${path.basename(filePath)} — ${sizeMb.toFixed(1)} MB, ${summary.figures} axes, ${summary.traces} traces`,
    );
    for (const [label, value] of rows) console.log(`  ${label.padEnd(42)} ${value}`);
    if (args.shot) console.log(`  screenshot                                 ${args.shot}`);
    if (errors.length > 0) {
      console.log(`\n  page errors (${errors.length}):`);
      for (const e of errors.slice(0, 8)) console.log(`    ${e}`);
    }
  } finally {
    await browser.close();
    if (server && !args.keepServer) server.kill("SIGTERM");
  }
}

function fmt(s) {
  return s.n === 0 ? "—" : `${ms(s.median)} / ${ms(s.p95)} / ${ms(s.worst)}  (${s.n} frames)`;
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
