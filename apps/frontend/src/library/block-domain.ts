import type { Block, BlockMetadata } from "../model/types";

/**
 * The domain a placed block carries.
 *
 * A block's `domain` decides how the canvas treats it: the colour of every
 * wire leaving it, whether its terminals draw as arrows or as open circles,
 * and which side of the causal/acausal split it falls on. Getting it wrong
 * does not fail anything — it draws a sheet that quietly misstates what kind
 * of connection the reader is looking at.
 *
 * It used to be guessed, in two copies of this function that had drifted
 * apart, from the first port's domain and then from `behavior.domain`. Both
 * guesses ignored the one field that actually answers the question: the
 * component's own `domain`, which the engine declares and the block-metadata
 * schema requires.
 *
 * Measured against the engine's 239 components, the guess disagreed with the
 * declaration for ten of them:
 *
 * - `converter.sig2phys` is `mixed`; the first port made it `physical-electrical`
 * - `converter.phys2sig` is `mixed`; the first port made it `signal`
 * - the three `physical_translational.sensor.*` blocks are translational; their
 *   first port is their signal output, so they became `physical-signal`
 * - `routing.bus_*`, `hierarchy.subsystem.{enabled,triggered}`, and the
 *   photodiode went the same way
 *
 * Every one of those is a component that straddles two domains, which is
 * exactly when a first-port heuristic has to be wrong: there is no first port
 * that speaks for the whole block, which is why the block declares a domain
 * of its own.
 *
 * The port fallback stays for a component that declares no domain. The schema
 * requires one and `gen-engine-catalog.mjs` now rejects a submission without
 * it, so this should be unreachable for any catalogue the app loads — but a
 * fallback that is never exercised costs nothing, and guessing is still better
 * than refusing to place the block.
 */
export function blockDomainOf(metadata: BlockMetadata): Block["domain"] {
  if (metadata.domain) return metadata.domain as Block["domain"];
  const firstPort = metadata.ports.outputs[0] ?? metadata.ports.inputs[0];
  if (firstPort?.kind.domain) return firstPort.kind.domain as Block["domain"];
  return "signal";
}
