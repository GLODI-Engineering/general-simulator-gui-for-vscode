/**
 * The component catalog, as the tests need to see it.
 *
 * Reads the same manifest the app loads, so a test that asks "give me
 * something with a thermal port" gets an answer that is true of the build
 * under test rather than one hard-coded years ago.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolved from the working directory, not from `import.meta.url`.
 *
 * Playwright transpiles specs to CommonJS, where `import.meta` does not
 * exist — the module loads, then dies on `exports is not defined` with a
 * stack pointing at the file's first line, which says nothing about the
 * cause. The runner's working directory is the config's directory, which
 * is the repo root.
 */
const MANIFEST = resolve(process.cwd(), "apps/frontend/src/library/engine-catalog.json");

export interface PortSpec {
  id: string;
  domain: string;
  direction: "in" | "out" | "inout";
  label?: string;
}

export interface ParamSpec {
  name: string;
  /** What the inspector shows. Not the same as `name`: `k` reads "Gain". */
  label: string;
  type: string;
  default?: unknown;
}

export interface ComponentSpec {
  type: string;
  label: string;
  paradigm: string;
  domain: string;
  category?: string;
  ports: PortSpec[];
  params: ParamSpec[];
}

interface RawPort {
  id: string;
  kind?: { domain?: string };
  label?: string;
}

interface RawParam {
  name: string;
  label?: string;
  type?: string;
  default?: unknown;
}

interface RawMetadata {
  name: string;
  params?: RawParam[];
  label?: string;
  paradigm?: string;
  domain?: string;
  category?: string;
  ports?: { inputs?: RawPort[]; outputs?: RawPort[]; inouts?: RawPort[] };
}

let cached: ComponentSpec[] | null = null;

export function allComponents(): ComponentSpec[] {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(MANIFEST, "utf8")) as Array<{ metadata: RawMetadata }>;
  cached = raw.map(({ metadata }) => {
    const groups: Array<[RawPort[] | undefined, PortSpec["direction"]]> = [
      [metadata.ports?.inputs, "in"],
      [metadata.ports?.outputs, "out"],
      [metadata.ports?.inouts, "inout"],
    ];
    const ports: PortSpec[] = [];
    for (const [list, direction] of groups) {
      for (const port of list ?? []) {
        ports.push({
          id: port.id,
          domain: port.kind?.domain ?? "unknown",
          direction,
          ...(port.label ? { label: port.label } : {}),
        });
      }
    }
    return {
      type: metadata.name,
      label: metadata.label ?? metadata.name,
      paradigm: metadata.paradigm ?? "unknown",
      domain: metadata.domain ?? "unknown",
      ...(metadata.category ? { category: metadata.category } : {}),
      ports,
      params: (metadata.params ?? []).map((param) => ({
        name: param.name,
        label: param.label ?? param.name,
        type: param.type ?? "string",
        ...(param.default === undefined ? {} : { default: param.default }),
      })),
    };
  });
  return cached;
}

export function componentByType(type: string): ComponentSpec {
  const found = allComponents().find((c) => c.type === type);
  if (!found) throw new Error(`no component "${type}" in the catalog`);
  return found;
}

/** Every port domain the catalog actually uses. */
export function portDomains(): string[] {
  const seen = new Set<string>();
  for (const component of allComponents()) {
    for (const port of component.ports) seen.add(port.domain);
  }
  return [...seen].sort();
}

export interface Representative {
  component: ComponentSpec;
  port: PortSpec;
}

export interface PickOptions {
  /** Only accept a port that can act as this end of a wire. */
  as?: "source" | "sink";
  /** Types to pass over. */
  skip?: string[];
}

function suits(port: PortSpec, as: PickOptions["as"]): boolean {
  if (!as) return true;
  if (port.direction === "inout") return true;
  return as === "source" ? port.direction === "out" : port.direction === "in";
}

/**
 * The simplest component carrying a usable port in `domain`.
 *
 * Simplest meaning fewest ports: a two-terminal part has an unambiguous
 * symbol and terminals far enough apart that a drag cannot land on the
 * wrong one, which is what a connection test wants to be about.
 */
export function representativeFor(
  domain: string,
  options: PickOptions = {},
): Representative | null {
  const { as, skip = [] } = options;
  const candidates = allComponents()
    .filter((c) => !skip.includes(c.type))
    .filter((c) => c.ports.some((p) => p.domain === domain && suits(p, as)))
    .sort((a, b) => a.ports.length - b.ports.length || a.type.localeCompare(b.type));
  const component = candidates[0];
  if (!component) return null;
  const port = component.ports.find((p) => p.domain === domain && suits(p, as));
  if (!port) return null;
  return { component, port };
}

/** Components whose ports span more than one domain — the bridges. */
export function bridgingComponents(): ComponentSpec[] {
  return allComponents().filter((c) => new Set(c.ports.map((p) => p.domain)).size > 1);
}

/**
 * What the inspector calls a parameter.
 *
 * The UI shows labels, not names — `k` reads "Gain", `n_inputs` reads
 * "Input count" — so a test that looks for a field called "k" finds
 * nothing and reports that the parameter does not exist.
 */
export function paramLabel(type: string, name: string): string {
  const param = componentByType(type).params.find((p) => p.name === name);
  if (!param) {
    const available = componentByType(type)
      .params.map((p) => p.name)
      .join(", ");
    throw new Error(`"${type}" has no parameter "${name}". It has: ${available || "(none)"}`);
  }
  return param.label;
}
