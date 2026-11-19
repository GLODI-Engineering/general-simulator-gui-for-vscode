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

/**
 * Powers of ten, keyed by the lowercased first letter of the suffix.
 *
 * Exponents rather than multipliers, because the value is built by appending the exponent to
 * the base and parsing once — `300n` becomes `300e-9` — instead of multiplying. The solver
 * does the same, for the same reason: `300 * 1e-9` is 3.0000000000000004e-7 while `300e-9` is
 * exactly 3e-7, and an echo that says what the solver will read has to agree in the last bit
 * too. See general-mna#41.
 */
const EXPONENTS: Record<string, number> = {
  t: 12,
  g: 9,
  k: 3,
  m: -3,
  u: -6,
  n: -9,
  p: -12,
  f: -15,
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
  const exponent = lower.startsWith("meg") ? 6 : EXPONENTS[lower[0] as string];
  if (exponent === undefined) return null;

  const factor = 10 ** exponent;
  // Parsed from the concatenation, so the result is the same number the solver reads. A base
  // the concatenation cannot express falls back to the multiplication — `300.` is a valid
  // number and `300.e-9` is not — which is the solver's own fallback as well.
  const concatenated = Number(`${text.slice(0, split)}e${exponent}`);
  const value = Number.isFinite(concatenated) ? concatenated : base * factor;

  return { value, factor, suffix };
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

/**
 * Was this text *meant* to be a number?
 *
 * The distinction matters because a parameter may legitimately hold an
 * expression or a parameter reference — `{Rload}`, `Vin*2` — which is not a
 * number and must be kept as written. But `10x` is not an expression; it is
 * a number with a suffix the solver does not know, and storing it as text
 * means a run fails later with something unhelpful instead of the field
 * saying so now.
 *
 * The rule: text that starts like a number was meant to be one.
 */
export function looksNumeric(raw: string): boolean {
  return /^[+-]?(\d|\.\d)/.test(raw.trim());
}

/**
 * What to store for a typed parameter, or null to refuse the edit.
 *
 * - a number the solver can read  -> that number
 * - an expression or reference    -> the text, unchanged
 * - a malformed number            -> null, so the previous value survives
 */
export function paramValueFrom(raw: string): number | string | null {
  const parsed = parseSpiceNumber(raw);
  if (parsed !== null) return parsed.value;
  if (looksNumeric(raw)) return null;
  return raw;
}
