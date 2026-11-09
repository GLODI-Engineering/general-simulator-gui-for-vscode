/**
 * Deriving a scripted block's ports from its source.
 *
 * Ports are declared on the schematic (`input_names` / `output_names`) and
 * handed to the code, which is why the two can disagree without anything
 * noticing. These read the source and say what it looks like it expects, so
 * the editor can offer to adopt it.
 *
 * What each language can actually tell us differs, and the difference is
 * not a limitation of the parsing but of the contract:
 *
 * - **Octave** declares both sides by name: `function [y1, y2] = f(u1, u2)`.
 *   This is the one case where the source is a complete answer.
 * - **Python** declares its inputs by name. Outputs are a returned tuple, so
 *   a count is recoverable when every `return` agrees and nothing is if they
 *   do not.
 * - **C** declares neither. `cscript_output` always has the same signature
 *   and receives `const double *in, int in_len`, so arity is only visible in
 *   how far the code indexes — `in[2]` means at least three.
 *
 * Deliberately shallow. A signature is read, not a program: a script that
 * computes its own indices gets the answer it deserves, and the user asked
 * for exactly that — if someone passes a vector through one port, that is
 * their business.
 */

export interface DerivedPorts {
  inputs: string[] | null;
  outputs: string[] | null;
  /** How the answer was reached, for showing the user what was read. */
  note: string;
}

const EMPTY: DerivedPorts = { inputs: null, outputs: null, note: "Nothing recognisable" };

/** Strip comments so a commented-out signature is never read as the real one. */
function stripComments(source: string, style: "c" | "python" | "octave"): string {
  let text = source;
  if (style === "c") {
    text = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  } else if (style === "python") {
    text = text.replace(/#[^\n]*/g, " ");
  } else {
    text = text.replace(/%[^\n]*/g, " ").replace(/#[^\n]*/g, " ");
  }
  return text;
}

function names(list: string): string[] {
  return list
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** A parameter name, with any default or type annotation removed. */
function bareName(parameter: string): string | null {
  const name = parameter.split(/[=:]/)[0]?.trim() ?? "";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null;
  return name;
}

/**
 * `function [y1, y2] = name(u1, u2)` — the complete case.
 *
 * `name` picks a particular function when the file holds several; without
 * it the first is taken, which is Octave's own entry-point convention.
 */
export function parseOctavePorts(source: string, functionName?: string): DerivedPorts {
  const text = stripComments(source, "octave");
  // The output clause is optional, but when present it *must* carry the
  // `=`. Without that the optional group happily eats the function's own
  // name: `function report(u)` parsed as output "repor", function "t".
  const pattern =
    /function\s+(?:(?:\[([^\]]*)\]|([A-Za-z_]\w*))\s*=\s*)?([A-Za-z_]\w*)\s*\(([^)]*)\)/g;

  for (const match of text.matchAll(pattern)) {
    const [, bracketed, single, name, args] = match;
    if (functionName && name !== functionName) continue;
    const outputs = bracketed !== undefined ? names(bracketed) : single ? [single] : [];
    const inputs = names(args ?? "")
      .map(bareName)
      .filter((n): n is string => n !== null);
    return {
      inputs,
      outputs,
      note: `function ${name} declares ${inputs.length} input${
        inputs.length === 1 ? "" : "s"
      } and ${outputs.length} output${outputs.length === 1 ? "" : "s"}`,
    };
  }
  return EMPTY;
}

/**
 * `def name(a, b, c)` — inputs by name; outputs only as a count.
 *
 * `self`, `state`, `t` and `dt` are the block protocol's own leading
 * arguments, not signals, so they are dropped when they appear first. A
 * `pyfunc` that takes only signals is unaffected.
 */
const PROTOCOL_ARGS = new Set(["self", "state", "t", "dt"]);

export function parsePythonPorts(source: string, functionName?: string): DerivedPorts {
  const text = stripComments(source, "python");
  const pattern = /def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g;

  for (const match of text.matchAll(pattern)) {
    const [, name, args] = match;
    if (functionName && name !== functionName) continue;

    const all = names(args ?? "")
      .map(bareName)
      .filter((n): n is string => n !== null);
    // Only leading protocol arguments are dropped; a signal legitimately
    // called `t` further along the list is still a signal.
    let start = 0;
    while (start < all.length && PROTOCOL_ARGS.has(all[start] as string)) start += 1;
    const inputs = all.slice(start);

    const outputs = pythonReturnArity(text, name as string);
    return {
      inputs,
      outputs,
      note:
        `def ${name} declares ${inputs.length} input${inputs.length === 1 ? "" : "s"}` +
        (outputs ? `, and returns ${outputs.length}` : ", and its return shape is not obvious"),
    };
  }
  return EMPTY;
}

/**
 * How many values a function returns, when every `return` in it agrees.
 *
 * Disagreement is not an error to report — a function may return early on a
 * guard — it simply means the source cannot answer, so nothing is claimed.
 */
function pythonReturnArity(text: string, functionName: string): string[] | null {
  const start = text.indexOf(`def ${functionName}`);
  if (start < 0) return null;
  const next = text.indexOf("\ndef ", start + 1);
  const body = text.slice(start, next < 0 ? undefined : next);

  const counts = new Set<number>();
  for (const match of body.matchAll(/\breturn\s+([^\n#]+)/g)) {
    const expression = (match[1] ?? "").trim().replace(/^\(|\)$/g, "");
    if (expression === "") continue;
    // Commas inside brackets or calls are not top-level separators.
    let depth = 0;
    let count = 1;
    for (const character of expression) {
      if ("([{".includes(character)) depth += 1;
      else if (")]}".includes(character)) depth -= 1;
      else if (character === "," && depth === 0) count += 1;
    }
    counts.add(count);
  }
  if (counts.size !== 1) return null;
  const [count] = [...counts];
  return Array.from({ length: count as number }, (_, i) => `y${i + 1}`);
}

/**
 * C declares no arity, so it is inferred from how far the code indexes.
 *
 * `in[2]` means the block expects at least three inputs. A computed index
 * is invisible to this and that is accepted: the user asked for a static
 * read of the source, not an interpreter.
 */
/**
 * Read a `cscript_arity` declaration, if the source has one.
 *
 * ```c
 * int cscript_arity(int *in_len, int *out_len) {
 *     *in_len = 2;
 *     *out_len = 1;
 *     return 0;
 * }
 * ```
 *
 * The engine honours this symbol (general-simulator#30): when present it checks the counts
 * against the netlist before the first step and refuses a disagreement. That makes it the one
 * thing in a `.c` file that is authoritative rather than inferred, so it wins here too.
 *
 * `null` when the function is absent, when it does not assign both out-parameters, or when it
 * can only be seen to `return` non-zero — declining is not an error, it just means there is
 * nothing to read. A negative value means "not declaring this side", exactly as the engine
 * reads it.
 */
function parseDeclaredArity(
  text: string,
): { inputs: number | null; outputs: number | null } | null {
  const fn = /\bint\s+cscript_arity\s*\([^)]*\)\s*\{/.exec(text);
  if (!fn) return null;

  // The body, by brace balance from the opening brace — a regex cannot do this, and the
  // function may contain nested blocks.
  const open = fn.index + fn[0].length - 1;
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const body = text.slice(open + 1, end);

  // Declining: every `return` says non-zero. A body with no `return 0` at all cannot be read
  // as declaring, since the engine only trusts the values when it returns 0.
  const returns = [...body.matchAll(/\breturn\s+(-?\d+)\s*;/g)].map((m) => Number(m[1]));
  if (returns.length > 0 && returns.every((value) => value !== 0)) return null;

  const assigned = (name: string): number | null => {
    const match = new RegExp(`\\*\\s*${name}\\s*=\\s*(-?\\d+)`).exec(body);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };

  const inputs = assigned("in_len");
  const outputs = assigned("out_len");
  if (inputs === null && outputs === null) return null;
  return { inputs, outputs };
}

export function parseCPorts(source: string): DerivedPorts {
  const text = stripComments(source, "c");

  // A declaration beats the inference below: the engine itself enforces it, so this is the one
  // thing a `.c` file says about its arity that is a fact rather than a floor.
  const declared = parseDeclaredArity(text);
  if (declared) {
    const name = (prefix: string, count: number | null) =>
      count === null ? null : Array.from({ length: count }, (_, i) => `${prefix}${i}`);
    const side = (count: number | null, what: string) =>
      count === null ? `${what} left open` : `${count} ${what}`;
    return {
      inputs: name("u", declared.inputs),
      outputs: name("y", declared.outputs),
      note:
        `cscript_arity declares ${side(declared.inputs, "inputs")} and ` +
        `${side(declared.outputs, "outputs")} — the engine checks the netlist against this`,
    };
  }

  const highest = (identifier: string): number => {
    let max = -1;
    for (const match of text.matchAll(
      new RegExp(`\\b${identifier}\\s*\\[\\s*(\\d+)\\s*\\]`, "g"),
    )) {
      const index = Number(match[1]);
      if (Number.isFinite(index) && index > max) max = index;
    }
    return max;
  };

  const inMax = highest("in");
  const outMax = highest("out");
  if (inMax < 0 && outMax < 0) return EMPTY;

  const build = (max: number, prefix: string) =>
    max < 0 ? null : Array.from({ length: max + 1 }, (_, i) => `${prefix}${i}`);

  return {
    inputs: build(inMax, "u"),
    outputs: build(outMax, "y"),
    note:
      "C declares no arity; read from the highest index the code uses — " +
      `in[${inMax < 0 ? "none" : inMax}], out[${outMax < 0 ? "none" : outMax}]`,
  };
}

/** Pick the parser for a block type and its source. */
export function derivePortsFor(
  blockType: string,
  source: string,
  functionName?: string,
): DerivedPorts {
  if (/oct(func|block)/.test(blockType)) return parseOctavePorts(source, functionName);
  if (/py(func|block)/.test(blockType)) return parsePythonPorts(source, functionName);
  if (/cscript/.test(blockType)) return parseCPorts(source);
  return EMPTY;
}
