/**
 * FE-56 / FE-65: Port compatibility checker.
 *
 * FE-56 adds kind/paradigm compatibility checks.
 * FE-65 adds signal-dimension mismatch checks.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortDesc {
  /** Port kind domain, e.g. 'signal', 'physical-electrical', etc. */
  kind: string;
  /** Port direction */
  direction?: "in" | "out" | "inout";
  /** Whether the port already has a wire connected to it (fan-in check) */
  driven?: boolean;
  /** Resolved signal dimension, if known */
  dim?: number[];
}

export type CompatResult =
  | { ok: true }
  | { ok: false; reason: string; expected?: number[]; actual?: number[] };

// ---------------------------------------------------------------------------
// Reserved kinds (spec §7.1: future domains, not yet connectable)
// ---------------------------------------------------------------------------

const RESERVED_KIND_PREFIX = "reserved.";

// ---------------------------------------------------------------------------
// Acausal kinds (no fan-in check, multi-terminal allowed)
// ---------------------------------------------------------------------------

const ACAUSAL_KINDS = new Set([
  "physical-electrical",
  "physical-translational",
  "physical-rotational",
  "physical-thermal",
  "electrical",
  "translational",
  "rotational",
  "thermal",
]);

function isAcausal(kind: string): boolean {
  return ACAUSAL_KINDS.has(kind);
}

// ---------------------------------------------------------------------------
// Main canConnect
// ---------------------------------------------------------------------------

/**
 * Check whether a wire can be drawn from `src` port to `dst` port.
 *
 * Checks (in order):
 * 1. Reserved kind — refuse
 * 2. Kind mismatch — refuse
 * 3. Fan-in on signal port — refuse (acausal ports allow multiple connections)
 * 4. Dim mismatch (FE-65) — refuse when both dims are resolved and differ
 */
export function canConnect(src: PortDesc, dst: PortDesc): CompatResult {
  // 1. Reserved kind check
  if (src.kind.startsWith(RESERVED_KIND_PREFIX) || dst.kind.startsWith(RESERVED_KIND_PREFIX)) {
    return { ok: false, reason: "reserved-kind" };
  }

  // 2. Kind mismatch
  if (src.kind !== dst.kind) {
    return { ok: false, reason: "kind-mismatch" };
  }

  // 3. Fan-in on signal ports (acausal ports may have multiple connections)
  if (!isAcausal(dst.kind) && dst.driven) {
    return { ok: false, reason: "fan-in-on-signal" };
  }

  // 4. Dimension mismatch (FE-65)
  if (src.dim !== undefined && dst.dim !== undefined) {
    if (!dimsEqual(src.dim, dst.dim)) {
      return { ok: false, reason: "dim-mismatch", expected: src.dim, actual: dst.dim };
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dimsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Build a tooltip message for a dim-mismatch result.
 * Acceptance criterion: 'Wire requires dim [N], source produces dim [M]'
 */
export function dimMismatchTooltip(expected: number[], actual: number[]): string {
  return `Wire requires dim [${expected.join(", ")}], source produces dim [${actual.join(", ")}]`;
}

// ---------------------------------------------------------------------------
// FE-102: connection-reject flash
// ---------------------------------------------------------------------------

/** Duration of the transient red reject flash, in milliseconds. */
export const REJECT_FLASH_MS = 600;

/** A rejected compatibility result (presentation helper; canConnect unchanged). */
export function isRejected(result: CompatResult): boolean {
  return result.ok === false;
}

export interface RejectFlash {
  /** Whether the flash is currently lit. */
  active(): boolean;
  /** Light the flash; auto-clears after `ms`. Re-triggering restarts the timer. */
  trigger(): void;
  /** Cancel any pending timer. */
  dispose(): void;
}

/**
 * Create a transient reject flash. Callers `trigger()` it when a wire-draw
 * attempt fails canConnect; the flag clears itself after `ms` (~600ms). This is
 * presentation only — it neither creates a wire nor changes canConnect.
 */
export function createRejectFlash(
  onChange?: (active: boolean) => void,
  ms: number = REJECT_FLASH_MS,
): RejectFlash {
  let on = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    active: () => on,
    trigger: () => {
      on = true;
      onChange?.(true);
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        on = false;
        onChange?.(false);
        timer = null;
      }, ms);
    },
    dispose: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
