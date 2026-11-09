import { describe, expect, it } from "vitest";

import catalog from "../../../library/catalog-manifest.json";
import { SYMBOL_DRAWINGS } from "./registry";

/**
 * A drawing nobody can reach is a drawing that does not exist.
 *
 * `symbolKeyCandidates` (component-symbols.tsx) bridges
 * `physical-electrical` <-> `physical_electrical` and nothing else, and a block
 * on a sheet carries its *type* — never its aliases. So artwork keyed only under
 * a name the catalog does not use for a type silently loses: the block falls
 * through to the older fallback table and draws as a labelled box.
 *
 * That had happened to the integrator, the derivative, the unit delay, the
 * saturation, the rate limiter, the zero-order hold and min/max — each with a
 * hand-drawn symbol sitting unused in this directory while the sheet showed
 * "1/s", "s", "z^-N", "sat". Nothing failed, because nothing was looking.
 */

function catalogTypes(): string[] {
  const types = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        // A parameter declares `type: "number"`; a block declares a dotted,
        // namespaced one. Without the dot this also collects "bool", "enum",
        // "matrix" and friends, which are not blocks and have no artwork.
        if (key === "type" && typeof value === "string" && value.includes(".")) {
          types.add(value);
        }
        walk(value);
      }
    }
  };
  walk(catalog);
  return [...types];
}

/** The same candidates `component-symbols.tsx` builds, kept in step by its own test. */
function candidates(key: string): string[] {
  const normalized = key.replaceAll("physical-electrical", "physical_electrical");
  const denormalized = key.replaceAll("physical_electrical", "physical-electrical");
  const withoutPrefix = normalized.startsWith("physical_electrical.")
    ? normalized.slice("physical_electrical.".length)
    : normalized;
  return [key, normalized, denormalized, withoutPrefix];
}

/**
 * Artwork the catalog carries no type for. Each is a real gap, listed so that
 * "unreachable" stays a decision someone made rather than something that
 * happened — delete an entry when its type lands in the catalog.
 *
 * `passive.switch.ideal` is the uncomfortable one: `library/simulator-compat.ts`
 * names it as the one device the engine can actually simulate, and the catalog
 * has no such type — it offers `physical-electrical.switch.{generic,
 * voltage_controlled,current_controlled}` instead. That is the catalog-versus-
 * engine vocabulary split already recorded as known-broken, not something this
 * test can fix by adding a key.
 */
const NO_CATALOG_TYPE = new Set([
  // No catalog type at all — artwork drawn ahead of the component.
  "control.deadband",
  "control.quantizer",
  "logic.comparator",
  "semi.jfet.n",
  "semi.jfet.p",
  "passive.inductor.coupled",
  // Legacy aliases for a converter the catalog spells
  // `converter.{signal_to_physical_signal,physical_signal_to_signal}` — those
  // keys exist and are reachable; these two are the old names, kept rather than
  // deleted because nothing proves no saved sheet still carries them.
  "converter.sig2phys",
  "converter.phys2sig",
  // `signal-flow.math.math_function` is an 80x40 box and this artwork was drawn
  // for the 60x40 `math.fn*`: mapped onto it, the box sits left of centre and the
  // output lead floats ~26px clear of the pin. Rendered, looked at, reverted.
  // The drawing needs to follow its box before this can be keyed to the catalog.
  "math.fn1",
  "math.fn2",
  "math.fn3",
  // Same story as math_function, one box size out: the catalog gives cccs/ccvs an
  // 80x60 box while this artwork draws its terminals for a 60x40 one. Keyed to the
  // catalog, the diamond rendered with its terminal stubs floating clear of the
  // pins. Rendered, looked at, reverted. (The controlled voltage/current sources
  // are *not* here: they are already reachable under
  // `physical-electrical.source.controlled_{voltage,current}`, which is a
  // different catalog type from the 80x40 `...source.voltage.controlled_*`.)
  "source.dependent.cccs",
  "source.dependent.ccvs",
  // Sheet furniture the catalog does not model as blocks.
  "hierarchy.inport",
  "hierarchy.outport",
  "routing.goto",
  "routing.from",
  // See the note above.
  "passive.switch.ideal",
]);

describe("every drawing is reachable from a catalog type", () => {
  const reachable = new Set<unknown>();
  for (const type of catalogTypes()) {
    for (const candidate of candidates(type)) {
      const drawing = SYMBOL_DRAWINGS[candidate];
      if (drawing) {
        reachable.add(drawing);
        break;
      }
    }
  }

  it("the catalog resolves at least one key per drawing, or says why not", () => {
    const orphaned: string[] = [];
    for (const [key, drawing] of Object.entries(SYMBOL_DRAWINGS)) {
      if (reachable.has(drawing)) continue;
      if (NO_CATALOG_TYPE.has(key)) continue;
      orphaned.push(key);
    }
    expect(
      orphaned,
      "artwork no catalog type can reach — add the catalog's own spelling as a key " +
        "in registry.ts, or list it in NO_CATALOG_TYPE with the reason",
    ).toEqual([]);
  });

  it("the allowlist does not outlive its reason", () => {
    const stale = [...NO_CATALOG_TYPE].filter((key) => {
      const drawing = SYMBOL_DRAWINGS[key];
      return drawing !== undefined && reachable.has(drawing);
    });
    expect(stale, "these are reachable now — remove them from NO_CATALOG_TYPE").toEqual([]);
  });
});
