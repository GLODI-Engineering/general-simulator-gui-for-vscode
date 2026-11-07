/**
 * Param-driven port expansion.
 *
 * Some block types do not have a fixed port list: the count comes from one of the
 * block's own parameters. `control.sum` declares `ports.variadic_inputs` with
 * `count_from: signs`, so a block with `signs = "+-"` has two inputs and one with
 * `signs = "++-"` has three. The script-hosted blocks (`extensibility.pyblock` and
 * friends) do the same in both directions, from `input_names` / `output_names`.
 *
 * The metadata schema has always described this ("The frontend instantiates one
 * port per element of the controlling param") and `catalog-core` already validates
 * that `count_from` names a real string/vector/integer param — but nothing ever
 * instantiated the ports. `getMetadataPortCenters` read `ports.inputs` / `ports.outputs`
 * literally, so `control.sum` rendered with **no input handles at all** (its static
 * `inputs` list is empty) and a `pyblock` always rendered exactly one input and one
 * output however many its params declared. Wires to the missing ports could not
 * resolve an endpoint and fell back to node-centre coordinates, drawing as diagonal
 * "invalid" strokes across the sheet.
 *
 * Expanded ports are spread evenly along their side with `offset = extent * (i+1)/(n+1)`.
 * That is not a new convention: it is the spacing the hand-authored port lists in the
 * catalog already use (`control.transform.park`'s four inputs sit at 18/35/53/70 on an
 * 88-tall bbox, i.e. 88*i/5), so a variadic block lines up with a fixed one of the same
 * height.
 */

import type { BlockMetadata, BlockPort, ParamValue, PortKindDomain } from "../../model/types";

/** How many ports a `count_from` param value implies. */
export function variadicCount(value: ParamValue | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  if (typeof value === "string") return value.length;
  if (Array.isArray(value)) return value.length;
  return 0;
}

function expand(
  template: BlockPort,
  count: number,
  bbox: [number, number],
  names: ParamValue | undefined,
): BlockPort[] {
  const side = template.side ?? "left";
  // Left/right ports are spaced down the block's height; top/bottom across its width.
  const extent = side === "left" || side === "right" ? bbox[1] : bbox[0];
  const labels = Array.isArray(names) ? names : undefined;
  const out: BlockPort[] = [];
  for (let i = 0; i < count; i++) {
    const label = labels?.[i];
    out.push({
      ...template,
      id: `${template.id}${i}`,
      // A `vector` count_from param (pyblock's `input_names`) carries the real port
      // names, so use them as labels. A string one (sum's `signs`) does not.
      label: typeof label === "string" && label.length > 0 ? label : template.label,
      side,
      offset: Math.round((extent * (i + 1)) / (count + 1)),
    });
  }
  return out;
}

export interface ResolvedPorts {
  inputs: BlockPort[];
  outputs: BlockPort[];
}

/**
 * The ports a block instance actually has, given its parameter values.
 *
 * Returns the metadata's own `inputs`/`outputs` untouched when the type declares no
 * variadic group — which is every type but `control.sum` and the `extensibility.*`
 * family — so this is a no-op for the overwhelming majority of blocks.
 */
/**
 * Applies a port's `domain_from`: the name of a param that selects its kind
 * domain at runtime.
 *
 * A boundary port's paradigm is the author's choice, not the component's —
 * `hierarchy.inport` offers five domains in its `kind` param — but the port
 * could only declare one domain statically, and declared `signal`. So a
 * physical boundary port carried a signal kind: it drew the causal arrowhead
 * instead of the acausal terminal, and the wire leaving it took the signal
 * colour into a physical net.
 */
function applyDomainFrom(ports: BlockPort[], params: Record<string, ParamValue>): BlockPort[] {
  // Returns the *same array* when nothing is overridden. Not an optimisation:
  // `BlockNode` memoises on metadata identity, so allocating a fresh array for
  // every block on every resolve would defeat that for the whole catalog, and
  // `resolve-ports`' own test pins the identity for exactly that reason.
  let changed = false;
  const resolved = ports.map((port) => {
    const source = port.domain_from;
    if (!source) return port;
    const chosen = params[source];
    if (typeof chosen !== "string" || chosen.length === 0) return port;
    changed = true;
    return { ...port, kind: { ...port.kind, domain: chosen as PortKindDomain } };
  });
  return changed ? resolved : ports;
}

export function resolveBlockPorts(
  metadata: BlockMetadata,
  params: Record<string, ParamValue> = {},
): ResolvedPorts {
  const declared = metadata.ports;
  const variadicIn = declared?.variadic_inputs;
  const variadicOut = declared?.variadic_outputs;
  if (!variadicIn && !variadicOut) {
    return {
      inputs: applyDomainFrom(declared?.inputs ?? [], params),
      outputs: applyDomainFrom(declared?.outputs ?? [], params),
    };
  }

  const bbox = resolveBlockBbox(metadata, params);
  let inputs = declared?.inputs ?? [];
  let outputs = declared?.outputs ?? [];

  // An expanded port replaces a static one of the same id. `extensibility.pyblock`
  // declares a static `in0`/`out0` so a block with no params still draws something;
  // once `input_names` is set, the expansion owns those ids.
  const merge = (statics: BlockPort[], expanded: BlockPort[]): BlockPort[] => {
    const taken = new Set(expanded.map((p) => p.id));
    return [...statics.filter((p) => !taken.has(p.id)), ...expanded];
  };

  if (variadicIn) {
    const source = params[variadicIn.count_from];
    const count = variadicCount(source);
    // A count of 0 (param absent, or an empty/0 value) leaves the static list alone
    // rather than silently deleting every port the type draws.
    if (count > 0) {
      inputs = merge(inputs, expand(variadicIn.template, count, bbox, source));
    }
  }
  if (variadicOut) {
    const source = params[variadicOut.count_from];
    const count = variadicCount(source);
    if (count > 0) {
      outputs = merge(outputs, expand(variadicOut.template, count, bbox, source));
    }
  }
  return { inputs: applyDomainFrom(inputs, params), outputs: applyDomainFrom(outputs, params) };
}

/**
 * Minimum spacing, in pre-scale bbox units, between two adjacent ports on the same side.
 *
 * Ports are drawn with a 10px label (Port.tsx) and the whole symbol is magnified by
 * SYMBOL_SCALE = 2, so 12 units is 24px on screen — about the tightest pitch at which
 * two stacked port labels do not overlap.
 *
 * This is a floor, not a target. A block whose declared bbox already gives its ports at
 * least this much room keeps that bbox exactly, so no fixed-port block in the catalog is
 * affected; it only matters for a variadic block, whose port count the authored bbox
 * cannot have anticipated (`extensibility.pyblock` declares 70x40 but a block with four
 * `input_names` would have to fit four ports into 40 units, a pitch of 8).
 */
export const MIN_PORT_PITCH = 12;

/**
 * The bbox a block instance should be drawn at, grown if its resolved port count does not
 * fit the declared one. Returns `metadata.symbol.bbox` itself when no growth is needed.
 */
export function resolveBlockBbox(
  metadata: BlockMetadata,
  params: Record<string, ParamValue> = {},
): [number, number] {
  const declared = metadata.symbol.bbox;
  const variadicIn = metadata.ports?.variadic_inputs;
  const variadicOut = metadata.ports?.variadic_outputs;
  if (!variadicIn && !variadicOut) {
    return declared;
  }

  // Counted straight from the params and the templates' sides. Calling resolveBlockPorts
  // here would recurse: it sizes its offsets against this function's result.
  const onAxis = (axis: "v" | "h") => {
    let most = 0;
    for (const group of [variadicIn, variadicOut]) {
      if (!group) continue;
      const side = group.template.side ?? "left";
      const groupAxis = side === "left" || side === "right" ? "v" : "h";
      if (groupAxis !== axis) continue;
      const count = variadicCount(params[group.count_from]);
      // Static ports on the same side share the extent.
      const statics = (group === variadicIn ? metadata.ports.inputs : metadata.ports.outputs)
        .filter((p) => (p.side ?? "left") === side)
        .filter(
          (p) =>
            !p.id.startsWith(group.template.id) ||
            Number.isNaN(Number(p.id.slice(group.template.id.length))),
        );
      most = Math.max(most, count + statics.length);
    }
    return most;
  };

  // Ports sit at extent*(i+1)/(n+1), so n ports need (n+1)*pitch of extent.
  const vertical = onAxis("v");
  const horizontal = onAxis("h");
  const w = Math.max(declared[0], horizontal > 0 ? (horizontal + 1) * MIN_PORT_PITCH : 0);
  const h = Math.max(declared[1], vertical > 0 ? (vertical + 1) * MIN_PORT_PITCH : 0);
  return w === declared[0] && h === declared[1] ? declared : [w, h];
}

export default resolveBlockPorts;
