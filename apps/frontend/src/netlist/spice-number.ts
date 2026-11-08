/**
 * The netlist number grammar, as the solver actually implements it.
 *
 * This mirrors `parse_spice_number` in general-mna (`src/expression.rs`)
 * deliberately and exactly, because the frontend's job here is to show the
 * user what the solver will read — not what a reasonable person might expect
 * it to read. The two differ in one place that matters enormously.
 *
 * **`M` is milli, not mega.** Suffixes are case-insensitive, so `1M`, `1m`
 * and `1Milli` are all 0.001, and mega is spelled `MEG`. This is standard
 * SPICE and it is also a trap: in power electronics `1M` is naturally read
 * as a megohm, and getting milli instead is a factor of 10^9 on a
 * resistance. Nothing downstream catches it — the value is legal, just a
 * billion times off — which is why the editor should say what it parsed.
 *
 * A trailing unit is allowed and ignored, as in SPICE: `1kohm` is 1000 and
 * `10uF` is 1e-5. Only the first letter (or the `meg` prefix) is read.
 */

/** Multipliers, keyed by the lowercased first letter of the suffix. */
const FACTORS: Record<string, number> = {
  t: 1e12,
  g: 1e9,
  k: 1e3,
  m: 1e-3,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
};

export interface ParsedNumber {
  value: number;
  /** The multiplier that was applied, 1 when the text was a plain number. */
  factor: number;
  /** The suffix as written, empty for a plain number. */
  suffix: string;
}

/**
 * Parse a netlist number, or return null if the solver would not accept it.
 *
 * Plain floating point is tried first, exactly as the solver does, so `1e3`
 * is 1000 rather than being read as the base `1` with an `e3` suffix.
 */
export function parseSpiceNumber(raw: string): ParsedNumber | null {
  const text = raw.trim();
  if (text === "") return null;

  // `Number("")` is 0 and `Number(" ")` is 0, both already excluded above.
  // `Number("1,5")` is NaN, which is what we want — a comma is not a decimal
  // point in this grammar.
  const plain = Number(text);
  if (Number.isFinite(plain)) {
    return { value: plain, factor: 1, suffix: "" };
  }

  const split = text.search(/[a-zA-Z]/);
  if (split <= 0) return null;

  const base = Number(text.slice(0, split));
  if (!Number.isFinite(base)) return null;

  const suffix = text.slice(split);
  const lower = suffix.toLowerCase();
  const factor = lower.startsWith("meg") ? 1e6 : FACTORS[lower[0] as string];
  if (factor === undefined) return null;

  return { value: base * factor, factor, suffix };
}

/** Just the number, for callers that do not care how it was written. */
export function spiceValueOf(raw: string): number | null {
  return parseSpiceNumber(raw)?.value ?? null;
}

const PREFIXES: Array<[number, string]> = [
  [1e12, "T"],
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
  [1e-12, "p"],
  [1e-15, "f"],
];

/**
 * Write a parsed value back in SI, for showing the user what was understood.
 *
 * Uses the real SI micro sign and a capital M for mega, which is the whole
 * point: the echo has to be unambiguous in exactly the way the input is not.
 * So `1M` in the box shows as `1 m` here, and `1MEG` shows as `1 M`.
 */
export function formatSiValue(value: number, unit = ""): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return unit ? `0 ${unit}` : "0";

  const magnitude = Math.abs(value);
  const entry = PREFIXES.find(([scale]) => magnitude >= scale) ?? PREFIXES[PREFIXES.length - 1];
  const [scale, prefix] = entry as [number, string];
  const scaled = value / scale;
  // Three significant figures is enough to see a mistake and not so many
  // that the echo becomes noise.
  const text = Number.parseFloat(scaled.toPrecision(3)).toString();
  const tail = `${prefix}${unit}`;
  return tail ? `${text} ${tail}` : text;
}

/**
 * True when `raw` is written in a way whose meaning is commonly mistaken.
 *
 * Only one case so far, and it is the expensive one: a bare `M` or `m`
 * suffix. Both are milli, and `M` is routinely written meaning mega.
 */
export function isAmbiguousSuffix(raw: string): boolean {
  const parsed = parseSpiceNumber(raw);
  if (!parsed || parsed.suffix === "") return false;
  return /^m$/i.test(parsed.suffix) || /^m(?!eg)[a-z]*$/i.test(parsed.suffix);
}
