import type { ModelDocument } from "../model/types";

const KEY_ORDER: Record<string, string[]> = {
  block: [
    "domain",
    "fidelity",
    "ic",
    "id",
    "label",
    "mirror",
    "paradigm",
    "params",
    "position",
    "rotation",
    // Optional; only present on spice-subckt.* instance blocks.
    "subckt_ref",
    "subsystem",
    "type",
  ],
  model: [
    "blocks",
    "grid",
    "id",
    "lines",
    "metadata",
    "name",
    "nets",
    "params",
    "parent_param_aliases",
    "ports",
    // Optional (spec §4.1). Listed so it lands in a stable slot instead of the
    // unknown-key tail; still only emitted when the document actually has it.
    "role",
    "simulation",
    // Optional; the reusable .SUBCKT definitions this model instantiates.
    "subckt_defs",
    "wires",
  ],
  net: ["is_reference", "kind", "name", "scope"],
  param: ["doc", "name", "unit", "value"],
  top: ["model", "schema_version"],
  wire: ["from", "id", "kind", "label", "net", "pinned", "to", "waypoints"],
};

function assertIntegerPair(value: unknown, path: string): void {
  if (!Array.isArray(value) || value.length !== 2) return;
  if (typeof value[0] === "number" && !Number.isInteger(value[0]))
    throw new Error(`Float coordinate at ${path}[0]`);
  if (typeof value[1] === "number" && !Number.isInteger(value[1]))
    throw new Error(`Float coordinate at ${path}[1]`);
}

function inferKind(value: Record<string, unknown>): string | undefined {
  if ("schema_version" in value && "model" in value) return "top";
  if ("blocks" in value && "wires" in value && "grid" in value) return "model";
  if ("type" in value && "paradigm" in value && "fidelity" in value) return "block";
  if ("from" in value && "to" in value && "waypoints" in value) return "wire";
  if ("scope" in value && "kind" in value && "name" in value) return "net";
  if ("name" in value && "value" in value) return "param";
  return undefined;
}

function orderedEntries(record: Record<string, unknown>, kind?: string): Array<[string, unknown]> {
  const order = kind ? KEY_ORDER[kind] : undefined;
  if (!order)
    return Object.keys(record)
      .sort()
      .map((key) => [key, record[key]]);
  const keys = [
    ...order.filter((key) => key in record),
    ...Object.keys(record)
      .filter((key) => !order.includes(key))
      .sort(),
  ];
  return keys.map((key) => [key, record[key]]);
}

function canonicalize(value: unknown, path = "$", forcedKind?: string): unknown {
  if (Array.isArray(value)) {
    assertIntegerPair(value, path);
    return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const kind = forcedKind ?? inferKind(record);
  return Object.fromEntries(
    orderedEntries(record, kind)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => {
        const childKind =
          key === "model"
            ? "model"
            : key === "params" && Array.isArray(entry)
              ? "param-list"
              : undefined;
        if (childKind === "param-list") {
          return [
            key,
            (entry as unknown[]).map((item, index) =>
              canonicalize(item, `${path}.${key}[${index}]`, "param"),
            ),
          ];
        }
        return [key, canonicalize(entry, `${path}.${key}`, childKind)];
      }),
  );
}

export function saveGsimSch(doc: unknown): string {
  return JSON.stringify(canonicalize(doc as ModelDocument, "$", "top"), null, 2);
}

export default saveGsimSch;
