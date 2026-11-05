/**
 * FE-102: Wire colour per PortKindDomain.
 *
 * The reference editor's phys/sig split is a strict subset of the existing
 * 11-value PortKindDomain. Rather than add a domain concept, wire colour is
 * driven from the full enum so thermal/mechanical/etc. get their own colours.
 *
 * The Record is exhaustive over PortKindDomain, so the type checker rejects any
 * future enum drift that forgets a colour.
 */

import type { PortKindDomain } from "../../model/types";

/** Red used for the connection-reject flash and invalid wires. */
export const REJECT_COLOR = "#dc2626";

/**
 * One colour per domain, fixed.
 *
 * Signal and physical-electrical were both pure black, which made the two
 * paradigms this canvas hosts indistinguishable on a sheet that mixes them —
 * exactly the sheets this tool exists for. Electrical keeps the near-black a
 * schematic is drawn in; signal takes a blue that is clearly not it at any
 * zoom, and the rest of the control-domain family are related to it.
 *
 * The remaining physical domains have their own colours already, and the
 * reserved ones are placeholders to be chosen when they are implemented.
 */
const WIRE_COLORS: Record<PortKindDomain, string> = {
  signal: "#1d4ed8",
  "signal-bus": "#1e3a8a",
  "function-call": "#116b2e",
  "physical-electrical": "#0f172a",
  "physical-translational": "#92400e",
  "physical-rotational": "#78350f",
  "physical-thermal": "#c2410c",
  "physical-signal": "#0c6478",
  mixed: "#0f172a",
  "reserved.physical-magnetic": "#334155",
  "reserved.physical-hydraulic": "#334155",
  "reserved.physical-fluid": "#334155",
};

export function wireColorForDomain(domain: PortKindDomain): string {
  return WIRE_COLORS[domain];
}

/**
 * Domains whose connections have a direction.
 *
 * A signal goes from the block that computes it to the blocks that read it,
 * and that direction is part of the model — so the wire carries an arrow. A
 * physical connection does not: an electrical node has a voltage across it
 * and a current through it, solved together, and there is no "from" end. An
 * arrow there would assert a causality the equations do not have.
 *
 * This is the acausal/causal split the whole document model rests on, so it
 * is stated once here rather than re-tested as `kind === "signal"` wherever
 * a wire is drawn — which is how `signal-bus`, `function-call` and
 * `physical-signal` ended up without the arrows they should have had.
 */
const CAUSAL_DOMAINS: ReadonlySet<PortKindDomain> = new Set<PortKindDomain>([
  "signal",
  "signal-bus",
  "function-call",
  // A sensed physical quantity crossing into the control layer: it is a
  // reading, and it flows one way.
  "physical-signal",
]);

export function isCausalDomain(domain: PortKindDomain | undefined): boolean {
  return domain !== undefined && CAUSAL_DOMAINS.has(domain);
}
