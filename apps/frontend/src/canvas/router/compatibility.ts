import type { PortKind } from "../../model/types";

export function checkPortCompatibility(from: PortKind, to: PortKind) {
  if (from.domain !== to.domain) {
    return {
      compatible: false,
      severity: "error" as const,
      reason: `${from.domain} cannot connect to ${to.domain}`,
    };
  }

  if (from.domain !== "signal" || to.domain !== "signal") {
    return { compatible: true, severity: "ok" as const, reason: null };
  }

  if (from.dims === "scalar" && typeof to.dims === "object" && "vector" in to.dims) {
    return {
      compatible: true,
      severity: "warning" as const,
      reason: "Scalar will broadcast to vector",
    };
  }

  if (to.dims === "scalar" && typeof from.dims === "object" && "vector" in from.dims) {
    return {
      compatible: true,
      severity: "warning" as const,
      reason: "Scalar will broadcast to vector",
    };
  }

  return { compatible: true, severity: "ok" as const, reason: null };
}

export const checkCompatibility = checkPortCompatibility;

export default checkPortCompatibility;
