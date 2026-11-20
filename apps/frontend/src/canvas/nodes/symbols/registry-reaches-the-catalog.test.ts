import { describe, expect, it } from "vitest";

import catalog from "../../../library/engine-catalog.json";
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

  // Every name a placed block can carry, which is what `loadCatalog` keys its entries by: the
  // component's `name`, its legacy `type` spelling, and its aliases.
  //
  // `name` used to be missing here, and the walk below collected `type` values only. That was
  // survivable while 143 of 240 components carried a legacy `type` -- enough of the namespace
  // came along for free that the gap never showed. gsim-core#59 pruned the library to the 76
  // components the engine compiles, of which only 30 carry a `type`, and sixteen drawings for
  // components that are still perfectly present reported themselves unreachable. The artwork
  // had not moved; this function was looking in one of the three places a block's type string
  // comes from.
  for (const entry of catalog as Array<{ metadata: Record<string, unknown> }>) {
    for (const field of ["name", "type"]) {
      const value = entry.metadata[field];
      if (typeof value === "string" && value.includes(".")) types.add(value);
    }
    const aliases = entry.metadata.aliases;
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        if (typeof alias === "string" && alias.includes(".")) types.add(alias);
      }
    }
  }

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
 * Rewritten for gsim-core#59, which pruned the engine's library from 240 components to the 76
 * it can compile. Almost everything below is now artwork for a component that no engine models,
 * which is a different and more honest kind of gap than before: the drawing is good, and there
 * is nothing to simulate behind it. It stays in `registry.ts` so that the day a target can
 * emit the device, the symbol is already drawn.
 *
 * Eleven entries left this list in the same change, because they became reachable. Six were
 * simply wrong by then — `passive.switch.ideal`, `passive.inductor.coupled`,
 * `converter.sig2phys`/`phys2sig` and `routing.goto`/`routing.from` are all catalogue types
 * now, the last two because gsim-core#54 made the editor's own universal components part of
 * the library. The other five — `math.fn1`/`fn2`/`fn3` and `source.dependent.cccs`/`ccvs` —
 * carried a note that their artwork is drawn for a bigger box than the catalogue gives them,
 * which is a rendering question and not a reachability one; it is now
 * omni-schematics#115 so the concern outlives this list.
 */
const NO_CATALOG_TYPE = new Set([
  // Semiconductors. No `TypeSpec` emits one, so the engine has no model to run behind the
  // symbol; `semi.*` was removed from the library wholesale.
  "semi.mosfet.n",
  "semi.mosfet.p",
  "semi.mosfet.vdmos",
  "semi.bjt.npn",
  "semi.bjt.pnp",
  "semi.diode.zener",
  "semi.jfet.n",
  "semi.jfet.p",
  "physical_electrical.semiconductor.mosfet_n",
  "physical_electrical.semiconductor.mosfet_p",
  "physical_electrical.semiconductor.bjt_npn",
  "physical_electrical.semiconductor.bjt_pnp",
  "physical_electrical.semiconductor.zener",
  "physical_electrical.semiconductor.led",
  "physical_electrical.semiconductor.thyristor",

  // Other electrical devices the engine has no card for.
  "passive.memristor",
  "physical_electrical.passive.memristor",
  "physical_electrical.sensor.voltage",
  "physical_electrical.sensor.current",
  "physical_electrical.tline.lossless",
  "physical_electrical.tline.lossy",
  "physical_electrical.opamp.ideal",
  "physical_electrical.opamp.finite_gain",
  "physical_electrical.opamp.band_limited",
  "physical_electrical.opamp.comparator",
  "physical_electrical.source.controlled_voltage",
  "physical_electrical.source.controlled_current",

  // Cross-domain converters. The engine models one conversion, signal <-> physical-electrical,
  // and the library keeps it as `converter.sig2phys`/`phys2sig` — which are reachable and no
  // longer on this list. These are the long legacy spellings of that same pair, plus the seven
  // thermal/rotational/translational pairs, whose domains have no components left to connect.
  "converter.signal_to_physical_signal",
  "converter.physical_signal_to_signal",
  "converter.electrical_to_rotational",
  "converter.rotational_to_electrical",
  "converter.electrical_to_thermal",
  "converter.electrical_to_translational",
  "converter.translational_to_electrical",
  "converter.rotational_to_translational",
  "converter.translational_to_rotational",

  // Signal-flow blocks with no `kind=` card: a rate limiter, a zero-order hold, abs, sign and
  // min/max. Both catalogue spellings of each, since a saved sheet may carry either.
  "control.rate_limiter",
  "control.zero_order_hold",
  "signal-flow.discontinuity.rate_limiter",
  "signal-flow.discrete.zero_order_hold",
  "signal-flow.math.abs",
  "signal-flow.math.sign",
  "signal-flow.math.minmax",
  "signal_flow.math.abs",
  "signal_flow.math.sign",
  "signal_flow.math.min_max",

  // A subsystem's boundary pins. The library has never modelled these as blocks; gsim-core#61
  // is what decides whether they are the editor's own vocabulary -- a universal component like
  // a Goto, resolved by flattening -- in which case they become catalogue types and leave this
  // list the way `routing.goto` just did.
  "hierarchy.inport",
  "hierarchy.outport",

  // Artwork drawn ahead of the component: no catalogue type has ever existed for these, and
  // none was removed by the prune.
  "control.deadband",
  "control.quantizer",
  "logic.comparator",
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
