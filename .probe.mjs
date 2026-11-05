import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const doc = JSON.parse(readFileSync(process.argv[2], "utf8"));
let browser; try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: "chrome" }); }
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.__gensim_load_document === "function");
await page.evaluate((d) => window.__gensim_load_document(d), doc);
await page.waitForTimeout(600);
const out = await page.evaluate(() => {
  const rows = [];
  for (const node of document.querySelectorAll("[data-block-id]")) {
    const nr = node.getBoundingClientRect();
    const svg = node.querySelector("svg");
    const sr = svg?.getBoundingClientRect();
    const ports = [...node.querySelectorAll("[data-port-id]")].map((p) => {
      const r = p.getBoundingClientRect();
      return { id: p.getAttribute("data-port-id"), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
    });
    // tightest ink bbox of the drawn geometry (lines/paths/circles), excluding text
    let ink = null;
    for (const el of svg?.querySelectorAll("line,path,rect,circle,polyline,polygon") ?? []) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      ink = ink ? { x0: Math.min(ink.x0, r.x), y0: Math.min(ink.y0, r.y), x1: Math.max(ink.x1, r.right), y1: Math.max(ink.y1, r.bottom) }
                : { x0: r.x, y0: r.y, x1: r.right, y1: r.bottom };
    }
    rows.push({
      id: node.getAttribute("data-block-id"),
      nodeW: Math.round(nr.width), nodeH: Math.round(nr.height),
      svgW: sr ? Math.round(sr.width) : null, svgH: sr ? Math.round(sr.height) : null,
      inkW: ink ? Math.round(ink.x1 - ink.x0) : null, inkH: ink ? Math.round(ink.y1 - ink.y0) : null,
      ports,
    });
  }
  const zoom = document.querySelector(".react-flow__viewport")?.style.transform ?? "";
  return { zoom, rows };
});
console.log(out.zoom);
for (const r of out.rows) console.log(JSON.stringify(r));
await browser.close();
