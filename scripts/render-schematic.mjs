#!/usr/bin/env node
/**
 * Render a .gsim_sch to a PNG so a human (or an agent) can *look* at it.
 *
 * Rendering quality is a correctness property here (AGENTS.md invariant 6)
 * and it is the one property unit tests cannot check: no assertion notices
 * that two labels overlap, that a wire leans three degrees off horizontal,
 * or that a symbol's stroke is too pale to read. The only way to know is to
 * produce the picture and look at it.
 *
 * Usage:
 *   node scripts/render-schematic.mjs --doc docs/circuit_test/buck_converter/buck_converter.gsim_sch
 *   node scripts/render-schematic.mjs --doc <file> --out /tmp/buck.png --theme dark --width 1600
 *
 * Flags:
 *   --doc <path>     .gsim_sch to render (required)
 *   --out <path>     output PNG (default: <scratch>/<docname>.png)
 *   --width/--height viewport size (default 1600x1000)
 *   --theme          light | dark (default light)
 *   --full           screenshot the whole window, not just the canvas
 *   --keep-server    leave the preview server running for a follow-up render
 *   --base <url>     use an already-running server instead of starting one
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// 127.0.0.1, not "localhost": vite binds loopback as IPv6 (::1) by default while
// Chromium resolves "localhost" to 127.0.0.1, and the render then fails with
// ERR_CONNECTION_REFUSED against a server that is demonstrably up.
const PREVIEW_HOST = "127.0.0.1";
const PREVIEW_PORT = 5173;
const DEFAULT_BASE = `http://${PREVIEW_HOST}:${PREVIEW_PORT}`;

function parseArgs(argv) {
  const args = { width: 1600, height: 1000, theme: "light", full: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--doc":
        args.doc = value;
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
      case "--full":
        args.full = true;
        break;
      case "--keep-server":
        args.keepServer = true;
        break;
      default:
        if (flag.startsWith("--")) throw new Error(`unknown flag: ${flag}`);
    }
  }
  if (!args.doc) throw new Error("--doc <path to .gsim_sch> is required");
  return args;
}

/** Start `vite preview` and resolve once it is actually serving. */
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
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill();
  throw new Error(`preview server never came up:\n${log}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const docPath = path.resolve(REPO_ROOT, args.doc);
  if (!existsSync(docPath)) throw new Error(`no such document: ${docPath}`);
  const document = JSON.parse(readFileSync(docPath, "utf8"));

  const outPath = path.resolve(
    REPO_ROOT,
    args.out ?? path.join("render-out", `${path.basename(docPath, path.extname(docPath))}.png`),
  );
  mkdirSync(path.dirname(outPath), { recursive: true });

  let server = null;
  const base = args.base ?? DEFAULT_BASE;
  if (!args.base) {
    // Reuse a preview already listening on the port. Spawning a second one
    // under --strictPort leaves a child that can never bind, and killing it at
    // the end would take down the server the render actually used.
    let alreadyUp = false;
    try {
      const probe = await fetch(DEFAULT_BASE, { method: "HEAD" });
      alreadyUp = probe.ok || probe.status === 404;
    } catch {
      alreadyUp = false;
    }
    if (!alreadyUp) server = await startPreview();
  }

  // Prefer Playwright's own bundled build; fall back to the system Chrome
  // channel so a render never depends on `npx playwright install` having
  // been run for this exact Playwright version.
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    browser = await chromium.launch({ channel: "chrome" });
  }
  try {
    const page = await browser.newPage({
      viewport: { width: args.width, height: args.height },
      deviceScaleFactor: 2, // retina-density PNG: stroke weight and type are
      // exactly what this pass is meant to judge
    });

    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-testid='app-shell'], main", { timeout: 20_000 });

    await page.evaluate((theme) => {
      document.documentElement.setAttribute("data-theme", theme);
    }, args.theme);

    await page.waitForFunction(() => typeof window.__gensim_load_document === "function", {
      timeout: 20_000,
    });
    await page.evaluate((doc) => window.__gensim_load_document(doc), document);

    // Let React commit the new graph before asking the canvas to frame it.
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__gensim_canvasFitView?.());
    await page.waitForTimeout(400);

    const target = args.full
      ? page
      : ((await page.$(".react-flow")) ?? (await page.$(".canvas-surface")) ?? page);
    await target.screenshot({ path: outPath });

    const blocks = document?.model?.blocks?.length ?? 0;
    const wires = document?.model?.wires?.length ?? 0;
    console.log(`rendered ${blocks} blocks / ${wires} wires -> ${outPath}`);
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
