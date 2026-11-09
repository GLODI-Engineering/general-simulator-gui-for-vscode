// Compiled from packages/schemas/definitions/blocks/block-metadata.schema.json
// (with model/port-kind.schema.json resolved into it) by
// apps/frontend/scripts/gen-validators.mjs. Calling `ajv.compile()` here
// instead would build the validator with runtime code generation, which the
// VS Code webview's CSP forbids — the import alone blanked the whole webview.
import { validateBlockMetadataSchema as validateBlockMetadata } from "../generated/validators/block-metadata.js";
import type { BlockMetadata, Fidelity, PortKindDomain } from "../model/types";
import catalogManifest from "./engine-catalog.json" with { type: "json" };

export type Tier = Fidelity;

export interface FidelityPortDef {
  id: string;
  kind: PortKindDomain;
  direction: "in" | "out" | "inout";
  label?: string;
  side?: "left" | "right" | "top" | "bottom";
  offset?: number;
}

export interface FidelityParamDef {
  id: string;
  type: "number" | "integer" | "vector" | "matrix" | "string" | "bool" | "enum";
  default?: unknown;
  unit?: string;
  doc?: string;
  min?: number;
  max?: number;
  choices?: string[];
}

export interface FidelityEntry {
  tier: Tier;
  ports: FidelityPortDef[];
  params: FidelityParamDef[];
  doc: string;
}

export type CatalogLookupError = "unknown-block" | "unknown-fidelity";

export interface CatalogLookupNull {
  entry: null;
  error: CatalogLookupError;
}

export interface CatalogEntrySource {
  filePath?: string;
  metadata: BlockMetadata;
}

let activeCatalog: Record<string, BlockMetadata> = {};

function catalogKeys(metadata: BlockMetadata): string[] {
  const type =
    "type" in metadata && typeof metadata.type === "string" ? metadata.type : metadata.name;
  const keys = new Set([metadata.name, type]);
  if (
    metadata.domain === "physical-electrical" &&
    !metadata.name.startsWith("physical-electrical.")
  ) {
    keys.add(`physical-electrical.${metadata.name}`);
  }
  return [...keys];
}

function metadataFidelities(metadata: BlockMetadata): FidelityEntry[] {
  return (metadata as BlockMetadata & { fidelities: FidelityEntry[] }).fidelities;
}

function v2Domain(domain: string): PortKindDomain {
  if (domain === "electrical") {
    return "physical-electrical";
  }
  if (domain === "thermal") {
    return "physical-thermal";
  }
  if (domain === "mechanical") {
    return "physical-translational";
  }
  return domain as PortKindDomain;
}

function inferParadigm(metadata: BlockMetadata): "signal-flow" | "physical-network" {
  return metadata.behavior.domain === "signal" ? "signal-flow" : "physical-network";
}

function normalizePortDomains(metadata: BlockMetadata): void {
  for (const port of metadata.ports.inputs ?? []) {
    port.kind = { ...port.kind, domain: v2Domain(port.kind.domain) };
  }
  for (const port of metadata.ports.outputs ?? []) {
    port.kind = { ...port.kind, domain: v2Domain(port.kind.domain) };
  }
}

function normalizeMetadata(metadata: BlockMetadata): BlockMetadata {
  const params = metadata.params ?? [];
  const portGroups = {
    inputs: metadata.ports?.inputs ?? [],
    outputs: metadata.ports?.outputs ?? [],
    variadic_inputs: metadata.ports?.variadic_inputs,
    variadic_outputs: metadata.ports?.variadic_outputs,
  };
  const behavior = metadata.behavior ?? {
    causality: "causal",
    domain: "signal",
    state_count: 0,
    equation_template: metadata.name,
  };
  const draft = metadata as BlockMetadata & {
    paradigm?: "signal-flow" | "physical-network";
    domain?: PortKindDomain;
    fidelities?: FidelityEntry[];
    port_sigs?: Record<string, string>;
  };
  if (draft.paradigm && draft.domain && draft.fidelities) {
    if (!metadata.ports) {
      (metadata as unknown as Record<string, unknown>).ports = { inputs: [], outputs: [] };
    } else {
      metadata.ports.inputs ??= [];
      metadata.ports.outputs ??= [];
    }
    normalizePortDomains(metadata);
    draft.domain = v2Domain(draft.domain);
    return metadata;
  }

  const ports = [
    ...portGroups.inputs.map(
      (port): FidelityPortDef => ({
        id: port.id,
        kind: v2Domain(port.kind.domain),
        direction: "in",
        label: port.label,
        side: port.side,
        offset: port.offset,
      }),
    ),
    ...portGroups.outputs.map(
      (port): FidelityPortDef => ({
        id: port.id,
        kind: v2Domain(port.kind.domain),
        direction: "out",
        label: port.label,
        side: port.side,
        offset: port.offset,
      }),
    ),
  ];
  return {
    ...metadata,
    ports: {
      inputs: portGroups.inputs,
      outputs: portGroups.outputs,
      variadic_inputs: portGroups.variadic_inputs,
      variadic_outputs: portGroups.variadic_outputs,
    },
    paradigm: draft.paradigm ?? inferParadigm({ ...metadata, behavior }),
    domain: draft.domain ?? v2Domain(behavior.domain),
    fidelities: draft.fidelities ?? [
      {
        tier: "ideal",
        ports,
        params: params.map((param) => ({
          id: param.name,
          type: param.type,
          default: param.default,
          doc: param.description,
          min: param.min,
          max: param.max,
          choices: param.choices,
        })),
        doc: metadata.description,
      },
    ],
  } as BlockMetadata;
}

function ensureActiveCatalog(): void {
  if (Object.keys(activeCatalog).length === 0) {
    // Through `unknown` because TypeScript infers a symbol's `bbox` from the JSON as
    // `number[]` where `BlockMetadata` wants `[number, number]`, and a tuple is not assignable
    // from an array of unknown length. `loadCatalog` validates every component against the
    // block-metadata schema on the way in, so the shape is checked at runtime rather than
    // assumed by this cast.
    loadCatalog(catalogManifest as unknown as CatalogEntrySource[]);
  }
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function isNumberMatrix(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every((item) => isNumberArray(item));
}

function validateParamDefault(param: BlockMetadata["params"][number], source: string): void {
  if (!("default" in param)) {
    return;
  }

  const value = param.default;
  let valid = true;
  switch (param.type) {
    case "number":
      valid = typeof value === "number";
      break;
    case "integer":
      valid = typeof value === "number" && Number.isInteger(value);
      break;
    case "vector":
      valid = isNumberArray(value);
      break;
    case "matrix":
      valid = isNumberMatrix(value);
      break;
    case "string":
      valid = typeof value === "string";
      break;
    case "bool":
      valid = typeof value === "boolean";
      break;
    case "enum": {
      const choices = param.choices ?? [];
      valid = typeof value === "string" && choices.includes(value);
      break;
    }
  }

  if (!valid) {
    throw new Error(
      `${source}: params.${param.name}.default must match declared type ${param.type}`,
    );
  }
}

function validateCrossFieldRules(metadata: BlockMetadata, source: string): void {
  const paramNames = new Set(metadata.params.map((param) => param.name));
  const paramsByName = new Map(metadata.params.map((param) => [param.name, param]));
  const fidelityTiers = new Set<Tier>();

  for (const param of metadata.params) {
    validateParamDefault(param, source);
  }

  if (metadata.main_param && !paramNames.has(metadata.main_param)) {
    throw new Error(`${source}: main_param must reference a param in params[]`);
  }

  // `list` is accepted alongside `vector` because the script blocks' `input_names` /
  // `output_names` are authored as `type: list` in their metadata.yaml.
  const countableTypes = ["string", "vector", "list", "integer"];
  for (const field of ["variadic_inputs", "variadic_outputs"] as const) {
    const variadicSource = metadata.ports?.[field]?.count_from;
    if (!variadicSource) continue;
    const param = paramsByName.get(variadicSource);
    if (!param) {
      throw new Error(`${source}: ${field}.count_from must reference an existing param`);
    }
    if (!countableTypes.includes(param.type)) {
      throw new Error(
        `${source}: ${field}.count_from must reference a string, vector, list, or integer param`,
      );
    }
  }

  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(metadata.behavior.equation_template)) {
    throw new Error(`${source}: behavior.equation_template must match dotted canonical form`);
  }

  for (const fidelity of metadataFidelities(metadata)) {
    if (fidelityTiers.has(fidelity.tier)) {
      throw new Error(`${source}: fidelities.${fidelity.tier} must be unique`);
    }
    fidelityTiers.add(fidelity.tier);
  }
}

export function loadCatalog(
  entries: Array<BlockMetadata | CatalogEntrySource>,
): Record<string, BlockMetadata> {
  const catalog: Record<string, BlockMetadata> = {};

  for (const entry of entries) {
    const metadata = normalizeMetadata("metadata" in entry ? entry.metadata : entry);
    const source = "metadata" in entry ? (entry.filePath ?? metadata.name) : metadata.name;

    if (!validateBlockMetadata(metadata)) {
      const error = validateBlockMetadata.errors?.[0];
      const pointer = error?.instancePath || error?.schemaPath || "<unknown>";
      throw new Error(`${source}: schema validation failed at ${pointer}`);
    }

    validateCrossFieldRules(metadata, source);
    for (const key of catalogKeys(metadata)) {
      catalog[key] = metadata;
    }
  }

  activeCatalog = Object.fromEntries(
    Object.entries(catalog).sort(([left], [right]) => left.localeCompare(right)),
  );
  return activeCatalog;
}

export function getCatalogEntry(type: string, fidelity: Tier | string): FidelityEntry | null {
  ensureActiveCatalog();
  const metadata = activeCatalog[type];
  if (!metadata) {
    return null;
  }
  return metadataFidelities(metadata).find((entry) => entry.tier === fidelity) ?? null;
}

export function getCatalogEntryResult(
  type: string,
  fidelity: Tier | string,
): FidelityEntry | CatalogLookupNull {
  ensureActiveCatalog();
  const metadata = activeCatalog[type];
  if (!metadata) {
    return { entry: null, error: "unknown-block" };
  }
  return (
    metadataFidelities(metadata).find((entry) => entry.tier === fidelity) ?? {
      entry: null,
      error: "unknown-fidelity",
    }
  );
}

export function listTiers(type: string): Tier[] {
  ensureActiveCatalog();
  const metadata = activeCatalog[type];
  return metadata ? metadataFidelities(metadata).map((entry) => entry.tier) : [];
}

/**
 * Get port dimension signatures for a block type.
 * Returns null if the block type is not in the catalog.
 * Port sigs are keyed by port id (may contain wildcard patterns like 'in*').
 */
export function getPortSigs(type: string): Record<string, string> | null {
  ensureActiveCatalog();
  const metadata = activeCatalog[type] as BlockMetadata & { port_sigs?: Record<string, string> };
  if (!metadata) return null;
  return metadata.port_sigs ?? null;
}
