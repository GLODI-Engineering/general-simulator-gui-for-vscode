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

const WIRE_COLORS: Record<PortKindDomain, string> = {
  signal: "#000000",
  "signal-bus": "#0a3058",
  "function-call": "#116b2e",
  "physical-electrical": "#000000",
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
