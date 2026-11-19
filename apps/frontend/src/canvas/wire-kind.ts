/**
 * What kind a wire is: the kind of the port it leaves.
 *
 * # Why this is not the block's domain
 *
 * Every wire-creating path used to write `kind: block.domain`, and for most of the catalogue
 * the two agree, which is why it survived. They disagree in exactly the two places that matter:
 *
 * | component | block `domain` | the port's own kind |
 * |---|---|---|
 * | `converter.sig2phys` | `mixed` | `out` → `physical-electrical` |
 * | `routing.bus_creator` | `signal` | `bus` → `signal-bus` |
 *
 * A converter spans two domains by definition — that is what it is for — so no single domain
 * can be right for both of its sides. A bus block carries a bus on one port and plain signals
 * on the others. So a wire drawn out of a converter's electrical side was marked `mixed`, and a
 * bus was marked `signal`: a sheet that misstates what is flowing through it, which then
 * misinforms every reader of `wire.kind` — net grouping, the inspector, a `.SUBCKT` boundary
 * port generated from a wire (`group-blocks.ts`), and the compatibility rule itself.
 *
 * The block's declared domain remains right for what it is: what the component *is*. It is not
 * what any particular wire carries.
 */

import type { Block, BlockMetadata, Wire } from "../model/types";
import { resolveBlockPorts } from "./nodes/resolve-ports";
import { type StructuredSubcktDef, resolveBlockMetadata } from "./subckt-metadata";

/**
 * The kind of `portId` on `block`, or the block's declared domain when the port cannot be
 * resolved.
 *
 * The fallback is deliberate and narrow: a block whose metadata is missing from the catalogue
 * still has to produce a drawable wire (that is the `routing.junction` case, whose single
 * `node` port is intentionally undeclared and takes the domain of whatever meets it). It is not
 * a silent default — when the port exists, its kind wins, always.
 */
export function wireKindOf(
  block: Block,
  portId: string,
  catalog: Record<string, BlockMetadata>,
  subcktDefs?: StructuredSubcktDef[] | null,
): Wire["kind"] {
  const metadata = resolveBlockMetadata(block, catalog, subcktDefs);
  if (!metadata) return block.domain as Wire["kind"];
  return wireKindFromMetadata(block, metadata, portId);
}

/** [`wireKindOf`] for a caller that already resolved the metadata. */
export function wireKindFromMetadata(
  block: Block,
  metadata: BlockMetadata,
  portId: string,
): Wire["kind"] {
  const resolved = resolveBlockPorts(metadata, block.params);
  const port =
    resolved.inputs.find((candidate) => candidate.id === portId) ??
    resolved.outputs.find((candidate) => candidate.id === portId);
  return (port?.kind.domain as Wire["kind"] | undefined) ?? (block.domain as Wire["kind"]);
}
