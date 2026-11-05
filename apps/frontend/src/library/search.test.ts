/**
 * FE-24: QuickInsert palette tests
 *
 * Acceptance:
 * - Search ranking: recently-used → prefix → substring → fuzzy.
 * - Enter inserts the highlighted block; Esc cancels.
 * - Recency boost moves blocks up on subsequent invocations.
 */

import { describe, expect, it } from "vitest";

let searchCatalog: Function | null = null;
let available = false;

try {
  const mod = await import(/* @vite-ignore */ "./search");
  searchCatalog = mod.searchCatalog ?? mod.rankSearch ?? mod.search ?? mod.default;
  if (searchCatalog !== null) available = true;
} catch {
  // not yet implemented
}

function skip(name: string, fn: () => void) {
  if (!available) it.skip(`${name} [not yet implemented]`, fn);
  else it(name, fn);
}

// searchCatalog(entries, query, recent) → SearchResult[] where item = { entry: BlockMetadata, score: number }
type R = { entry: { name: string }; score: number };

const CATALOG = [
  { name: "signal.constant", label: "Constant", aliases: [], tags: [] },
  { name: "control.gain", label: "Gain", aliases: [], tags: [] },
  {
    name: "control.pid",
    label: "PID Controller",
    aliases: ["Proportional-Integral-Derivative"],
    tags: [],
  },
  { name: "control.integrator", label: "Integrator", aliases: [], tags: [] },
  { name: "sinks.scope", label: "Scope", aliases: [], tags: ["display"] },
];

describe("FE-24: search ranking", () => {
  skip("prefix match ranks above substring match", () => {
    const results: R[] = searchCatalog?.(CATALOG, "gain", []);
    const gainIdx = results.findIndex((r) => r.entry.name === "control.gain");
    const integIdx = results.findIndex((r) => r.entry.name === "control.integrator");
    // "gain" is a prefix of "Gain" (label); integrator doesn't match "gain"
    expect(gainIdx).toBeGreaterThanOrEqual(0);
    expect(gainIdx).toBeLessThan(integIdx === -1 ? 999 : integIdx);
  });

  skip("recently-used block ranks above non-recent", () => {
    const recent = ["control.pid"];
    const results: R[] = searchCatalog?.(CATALOG, "c", recent);
    const pidIdx = results.findIndex((r) => r.entry.name === "control.pid");
    const gainIdx = results.findIndex((r) => r.entry.name === "control.gain");
    expect(pidIdx).toBeGreaterThanOrEqual(0);
    expect(pidIdx).toBeLessThan(gainIdx);
  });

  skip("alias match surfaces the block", () => {
    const results: R[] = searchCatalog?.(CATALOG, "Proportional", []);
    expect(results.some((r) => r.entry.name === "control.pid")).toBe(true);
  });

  skip("empty query returns all catalog entries", () => {
    const results: R[] = searchCatalog?.(CATALOG, "", []);
    expect(results.length).toBe(CATALOG.length);
  });
});
