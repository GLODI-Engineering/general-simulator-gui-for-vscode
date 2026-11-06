#!/usr/bin/env node
/**
 * Report wires a sheet draws as invalid.
 *
 * The canvas marks a wire invalid when its drawn polyline is not orthogonal
 * — `WireEdge`'s `showReject` — and paints it red. That is visible if you
 * are looking at the right part of a large sheet at the right zoom, and
 * invisible otherwise: on a 68-block converter, three red wires among sixty
 * are a few pixels in a corner.
 *
 * It is worth a tool because of what causes it. A wire whose endpoint names
 * a port the component does not have is not refused: the renderer falls
 * back to a default position and draws the wire somewhere plausible. Whether
 * that leaves a diagonal — and therefore shows up red — is luck. Six ground
 * wires on one sheet all named a port that did not exist; three happened to
 * come out orthogonal and looked perfectly fine.
 *
 * So this reports both: the wires that render invalid, and the endpoints
 * that name a port the block does not declare, which is the cause worth
 * fixing.
 *
 * Usage:
 *   node scripts/check-wires.mjs --doc path/to/sheet.gsim_sch
 *   node scripts/check-wires.mjs --doc sheet.gsim_sch --base http://127.0.0.1:5173
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW_HOST = "127.0.0.1";
const PREVIEW_PORT = 5173;
const DEFAULT_BASE = `http://${PREVIEW_HOST}:${PREVIEW_PORT}`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--doc") args.doc = argv[++i];
    else if (argv[i] === "--base") args.base = argv[++i];
    else if (argv[i] === "--keep-server") args.keepServer = true;
    else if (argv[i]?.startsWith("--")) throw new Error(`unknown flag: ${argv[i]}`);
  }
  if (!args.doc) throw new Error("--doc <path to .gsim_sch> is required");
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
  throw new Error("preview server never came up");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const docPath = path.resolve(REPO_ROOT, args.doc);
  if (!existsSync(docPath)) throw new Error(`no such document: ${docPath}`);
  const document = JSON.parse(readFileSync(docPath, "utf8"));

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
    const page = await browser.newPage({ viewport: { width: 2000, height: 1300 } });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__gensim_load_document === "function", {
      timeout: 20_000,
    });
    await page.evaluate((d) => window.__gensim_load_document(d), document);
    await page.waitForTimeout(1500);

    const report = await page.evaluate(() => {
      const invalid = [...document.querySelectorAll(".wire-edge.is-invalid")].map(
        (el) => el.getAttribute("data-wire-id") ?? el.id ?? "?",
      );
      return { drawn: document.querySelectorAll(".wire-edge").length, invalid };
    });

    // The cause: endpoints naming a port the block does not have.
    //
    // Checked against the ports each block actually *drew*, not against the
    // catalog. Several components generate their ports from a parameter —
    // `control.sum` from `signs`, `extensibility.octfunc` from its input
    // and output counts — and declare only the first in their metadata. A
    // catalog check calls every one of those a missing port, which buries
    // the real ones. What the block drew is what a wire can land on.
    const unknown = await page.evaluate(() => {
      const canvas = document.querySelector(".react-flow");
      const drawn = new Map();
      for (const node of canvas?.querySelectorAll("[data-block-id]") ?? []) {
        const id = node.getAttribute("data-block-id");
        if (!id) continue;
        drawn.set(
          id,
          new Set(
            [...node.querySelectorAll("[data-port-id]")].map((p) => p.getAttribute("data-port-id")),
          ),
        );
      }

      const serialized = JSON.parse(window.__gensim_serialize());
      const types = new Map(serialized.model.blocks.map((b) => [b.id, b.type]));
      const problems = [];
      for (const wire of serialized.model.wires) {
        for (const side of ["from", "to"]) {
          const end = wire[side];
          const ports = drawn.get(end.block);
          // A block that drew nothing is off-screen or not rendered; its
          // ports cannot be checked and silence is better than a guess.
          if (!ports || ports.size === 0) continue;
          if (!ports.has(end.port)) {
            problems.push(
              `${wire.id}.${side}: "${types.get(end.block) ?? "?"}" (${end.block}) ` +
                `drew no port "${end.port}" — it drew: ${[...ports].join(", ")}`,
            );
          }
        }
      }
      return problems;
    });

    console.log(`${path.basename(docPath)}: ${report.drawn} wires drawn`);
    console.log(
      `  rendered invalid: ${report.invalid.length}${report.invalid.length ? ` (${report.invalid.join(", ")})` : ""}`,
    );
    console.log(`  endpoints naming an unknown port: ${unknown.length}`);
    for (const line of unknown) console.log(`      ${line}`);

    process.exitCode = report.invalid.length > 0 || unknown.length > 0 ? 1 : 0;
  } finally {
    await browser.close();
    if (server && !args.keepServer) server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
