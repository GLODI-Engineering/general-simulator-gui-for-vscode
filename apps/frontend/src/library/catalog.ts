import type { BlockMetadata } from "../model/types";
import { type CatalogEntrySource, loadCatalog } from "./catalog-core";
import engineCatalog from "./engine-catalog.json";

/**
 * The component catalogue, as the engine declares it.
 *
 * This used to read `catalog-manifest.json`, built from 265 `metadata.yaml` files in
 * `packages/blocks`. That was a second description of the same components the engine already
 * describes, and the two drifted: the catalogue's switch took `r_off` where the engine's takes
 * `g_off`, and `supportsBlock` compared catalogue types against engine names and matched none
 * of 143, so every block on every sheet reported "not supported by the simulator".
 *
 * There is one description now. `engine-catalog.json` is generated from `gsim_py.catalog()` by
 * `scripts/gen-engine-catalog.mjs`, and a CI job fails when the committed copy stops matching.
 * To change a component's label, default or ports, edit the engine's library — which is the
 * point: there is nowhere else for it to disagree with.
 *
 * Components the engine cannot compile are included and carry `compilable: false`, so the
 * palette can show them and say so rather than pretending they do not exist.
 */
export function loadCatalogFromManifest(): Record<string, BlockMetadata> {
  // Through `unknown` because TypeScript infers a symbol's `bbox` from the JSON as `number[]`
  // where `BlockMetadata` wants `[number, number]`, and a tuple is not assignable from an
  // array of unknown length. The shape is guaranteed by the generator rather than by this
  // cast, so `catalog.test.ts` checks it at runtime — a blind cast over 239 components would
  // be exactly the kind of unchecked assumption this change is removing.
  return loadCatalog(engineCatalog as unknown as CatalogEntrySource[]);
}

export default loadCatalog;
