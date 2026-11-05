type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; value: string }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "**" }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  cos: Math.cos,
  exp: Math.exp,
  log: Math.log,
  log10: Math.log10,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
};

const CONSTANTS: Record<string, number> = { e: Math.E, pi: Math.PI };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (!char) break;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/\d|\./.test(char)) {
      const match = input.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
      if (!match) throw new Error(`Invalid number at ${index}`);
      tokens.push({ type: "number", value: Number(match[0]) });
      index += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = input.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!match) throw new Error(`Invalid identifier at ${index}`);
      if (match[0].startsWith("__")) throw new Error(`Disallowed identifier ${match[0]}`);
      tokens.push({ type: "identifier", value: match[0] });
      index += match[0].length;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma" });
      index += 1;
      continue;
    }
    if (char === "*" && input[index + 1] === "*") {
      tokens.push({ type: "operator", value: "**" });
      index += 2;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    throw new Error(`Disallowed token '${char}' at ${index}`);
  }
  return tokens;
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly params: Record<string, number>,
  ) {}

  parse(): number {
    const value = this.parseAdditive();
    if (this.peek()) throw new Error("Unexpected trailing token");
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private consume(): Token {
    const token = this.tokens[this.index];
    if (!token) throw new Error("Unexpected end of expression");
    this.index += 1;
    return token;
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    while (true) {
      const next = this.peek();
      if (next?.type !== "operator" || (next.value !== "+" && next.value !== "-")) break;
      const op = this.consume() as Token & { type: "operator" };
      const right = this.parseMultiplicative();
      value = op.value === "+" ? value + right : value - right;
    }
    return value;
  }

  private parseMultiplicative(): number {
    let value = this.parsePower();
    while (true) {
      const next = this.peek();
      if (next?.type !== "operator" || (next.value !== "*" && next.value !== "/")) break;
      const op = this.consume() as Token & { type: "operator" };
      const right = this.parsePower();
      value = op.value === "*" ? value * right : value / right;
    }
    return value;
  }

  private parsePower(): number {
    const left = this.parseUnary();
    const next = this.peek();
    if (next?.type === "operator" && next.value === "**") {
      this.consume();
      return left ** this.parsePower();
    }
    return left;
  }

  private parseUnary(): number {
    const next = this.peek();
    if (next?.type === "operator" && (next.value === "+" || next.value === "-")) {
      const op = this.consume() as Token & { type: "operator" };
      const value = this.parseUnary();
      return op.value === "-" ? -value : value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const token = this.consume();
    if (token.type === "number") return token.value;
    if (token.type === "identifier") {
      const next = this.peek();
      if (next?.type === "paren" && next.value === "(") {
        return this.parseCall(token.value);
      }
      if (token.value in CONSTANTS) return CONSTANTS[token.value] ?? 0;
      const value = this.params[token.value];
      if (value === undefined) throw new Error(`Unknown identifier ${token.value}`);
      return value;
    }
    if (token.type === "paren" && token.value === "(") {
      const value = this.parseAdditive();
      const close = this.consume();
      if (close.type !== "paren" || close.value !== ")") throw new Error("Expected ')'");
      return value;
    }
    throw new Error("Expected expression");
  }

  private parseCall(name: string): number {
    const fn = FUNCTIONS[name];
    if (!fn) throw new Error(`Unknown function ${name}`);
    this.consume();
    const args: number[] = [];
    const first = this.peek();
    if (first?.type === "paren" && first.value === ")") {
      this.consume();
      return fn(...args);
    }
    while (true) {
      args.push(this.parseAdditive());
      const next = this.consume();
      if (next.type === "paren" && next.value === ")") break;
      if (next.type !== "comma") throw new Error("Expected ',' or ')' in function call");
    }
    return fn(...args);
  }
}

export function evalExpr(expr: string, params: Record<string, number> = {}): number {
  const text = expr.startsWith("{") && expr.endsWith("}") ? expr.slice(1, -1) : expr;
  return new Parser(tokenize(text), params).parse();
}

/**
 * `evalExpr` for callers that treat "cannot be evaluated" as an ordinary
 * outcome rather than an error — the inspector greys out the resolved-value
 * readout while an expression is half-typed, and model param resolution skips
 * a param whose dependencies are not known yet and retries on the next pass.
 *
 * A non-finite result (division by zero, `log(-1)`) is reported as `null` too:
 * every caller wants a real number or nothing.
 */
export function tryEvalExpr(expr: string, params: Record<string, number>): number | null {
  try {
    const value = evalExpr(expr, params);
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function evalAll(params: Record<string, string | number>): Record<string, number> {
  const resolved: Record<string, number> = {};
  const resolving = new Set<string>();

  const resolveOne = (name: string, path: string[]): number => {
    if (name in resolved) return resolved[name] ?? 0;
    if (resolving.has(name)) {
      const cycle = [...path.slice(path.indexOf(name)), name];
      throw new Error(`Param cycle: ${cycle.join(" -> ")}`);
    }
    const raw = params[name];
    if (raw === undefined) throw new Error(`Unknown param ${name}`);
    resolving.add(name);
    const scope = new Proxy(resolved, {
      get(target, key) {
        if (typeof key !== "string") return undefined;
        if (key in target) return target[key];
        if (key in params) return resolveOne(key, [...path, key]);
        return undefined;
      },
    }) as Record<string, number>;
    const value = typeof raw === "number" ? raw : evalExpr(raw, scope);
    resolving.delete(name);
    resolved[name] = value;
    return value;
  };

  for (const name of Object.keys(params)) resolveOne(name, [name]);
  return resolved;
}

export const evaluate = evalExpr;
export const evaluateAll = evalAll;
export default evalExpr;
