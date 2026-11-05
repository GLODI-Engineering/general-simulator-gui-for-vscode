import type { Block, Model } from "../model/types";

type PortKey = `${string}:${string}`;

function portKey(blockId: string, portId: string): PortKey {
  return `${blockId}:${portId}`;
}

class UnionFind {
  private parent = new Map<PortKey, PortKey>();

  find(k: PortKey): PortKey {
    if (!this.parent.has(k)) {
      this.parent.set(k, k);
      return k;
    }
    let root = k;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root) ?? root;
    }
    let cur = k;
    while (cur !== root) {
      const next = this.parent.get(cur) ?? root;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: PortKey, b: PortKey): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  groups(): Map<PortKey, PortKey[]> {
    const result = new Map<PortKey, PortKey[]>();
    for (const k of this.parent.keys()) {
      const root = this.find(k);
      const list = result.get(root);
      if (list) list.push(k);
      else result.set(root, [k]);
    }
    return result;
  }
}

function spicePrefix(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("resistor")) return "R";
  if (t.includes("capacitor")) return "C";
  if (t.includes("inductor")) return "L";
  if (t.includes("diode")) return "D";
  if (t.includes("bjt")) return "Q";
  if (t.includes("mosfet") || t.includes("vdmos")) return "M";
  if (t.includes("jfet")) return "J";
  if (t.includes("mesfet")) return "Z";
  if (t.includes("vcvs")) return "E";
  if (t.includes("vccs")) return "G";
  if (t.includes("cccs")) return "F";
  if (t.includes("ccvs")) return "H";
  if (t.includes("voltage")) return "V";
  if (t.includes("current")) return "I";
  if (t.includes("switch")) return "S";
  if (t.includes("tline")) return "T";
  return "X";
}

/**
 * FE-152: last dot-separated segment of a block type, used to pick the
 * source waveform (dc/pulse/sin/pwl/ac) instead of the coarse "is this A
 * voltage/current source" substring check that used to collapse every
 * source sub-type — Pulse, Sine, PWL, AC — into a plain DC card using only
 * a `V`/`I` param that pulse/sine/PWL blocks don't even have (silently
 * defaulting to 0). Handles both catalog families' naming, e.g.
 * "source.voltage.pulse" and "physical-electrical.source.voltage_pulse"
 * both end in a segment containing "pulse".
 */
function sourceKind(type: string): "dc" | "pulse" | "sin" | "pwl" | "ac" | "unknown" {
  const lastSeg = type.split(".").pop() ?? "";
  if (lastSeg.includes("pulse")) return "pulse";
  if (lastSeg.includes("pwl")) return "pwl";
  if (lastSeg.includes("sin")) return "sin";
  if (lastSeg === "ac" || lastSeg.endsWith("_ac")) return "ac";
  if (lastSeg === "dc" || lastSeg.endsWith("_dc")) return "dc";
  return "unknown";
}

/**
 * Render a SPICE source card (everything after the two node names) for a
 * voltage or current source block, given its params and which of the two
 * SPICE prefixes (V1/V2/TD/... vs I1/I2/TD/...) the pulse variant uses.
 *
 * `warnLabel` is the human-facing name used in a warning when a block is
 * clearly meant to be a waveform (pulse/sin/pwl/ac by its type) but is
 * missing the params that would make that real — e.g. the catalog's
 * "Voltage Pulse Source" stub block only has a flat `V`/`I` amplitude, no
 * V1/V2/TD/TR/TF/PW/PER — so it can only ever be a constant, and the user
 * should be told why instead of silently getting a flat line.
 */
function renderSourceCard(
  block: Block,
  params: Record<string, unknown>,
  levelParam: "V" | "I",
  pulseParams: readonly [string, string],
  errors: string[],
  warnLabel: string,
): string {
  const kind = sourceKind(block.type.toLowerCase());
  const level = Number(params[levelParam] ?? params.amplitude ?? 0);

  if (kind === "pulse") {
    const [p1, p2] = pulseParams;
    if (params[p1] === undefined && params[p2] === undefined) {
      errors.push(
        `${warnLabel} '${block.label || block.id}' has no pulse-timing params ` +
          `(${p1}/${p2}/TD/TR/TF/PW/PER) — treated as a constant DC ${level} source.`,
      );
      return `DC ${level}`;
    }
    const v1 = params[p1] ?? 0;
    const v2 = params[p2] ?? level;
    const td = params.TD ?? 0;
    const tr = params.TR ?? 1e-9;
    const tf = params.TF ?? 1e-9;
    const pw = params.PW ?? 5e-7;
    const per = params.PER ?? 1e-6;
    return `PULSE(${v1} ${v2} ${td} ${tr} ${tf} ${pw} ${per})`;
  }

  if (kind === "sin") {
    const vo = params.VO ?? 0;
    const va = params.VA ?? level;
    const freq = params.FREQ ?? 1000;
    const td = params.TD ?? 0;
    const theta = params.THETA ?? 0;
    const phase = params.PHASE ?? 0;
    return `SIN(${vo} ${va} ${freq} ${td} ${theta} ${phase})`;
  }

  if (kind === "pwl") {
    const points = params.points;
    if (typeof points !== "string" || points.trim() === "") {
      errors.push(`${warnLabel} '${block.label || block.id}' has no PWL points — treated as 0.`);
      return "DC 0";
    }
    return `PWL(${points})`;
  }

  if (kind === "ac") {
    const freq = params.frequency ?? params.FREQ;
    // A pure "AC <mag>" card only drives .AC (small-signal) analyses — it
    // is silently zero for the rest of a TRAN run. ngspice allows a DC/AC
    // spec and a TRAN waveform function on the same source line, so when a
    // frequency param is present, combine them: real .AC sweeps still see
    // "AC <mag>", and a TRAN run sees an actual sinusoid instead of a flat
    // line at 0.
    if (freq !== undefined) {
      return `DC 0 AC ${level} SIN(0 ${level} ${freq})`;
    }
    return `DC 0 AC ${level}`;
  }

  return `DC ${level}`;
}

interface NetlistResult {
  netlist: string;
  errors: string[];
}

export function generateNetlist(
  model: Model,
  analysis: { type: string; tEnd?: number; tStep?: number },
): NetlistResult {
  const errors: string[] = [];
  const lines: string[] = [];
  const blocks = model.blocks;
  const wires = model.wires;

  lines.push(`* ${model.name || "Untitled"}`);
  lines.push("* Generated by General Simulator");
  lines.push("");

  const uf = new UnionFind();

  for (const block of blocks) {
    if (isGround(block)) continue;
    const ports = getBlockPorts(block);
    for (const p of ports) {
      uf.find(portKey(block.id, p));
    }
  }

  for (const wire of wires) {
    const from = portKey(wire.from.block, wire.from.port);
    const to = portKey(wire.to.block, wire.to.port);
    uf.union(from, to);
  }

  for (const block of blocks) {
    if (!isGround(block)) continue;
    const gndPorts = getBlockPorts(block);
    for (const p of gndPorts) {
      const pk = portKey(block.id, p);
      uf.find(pk);
    }
  }

  for (const wire of wires) {
    const from = portKey(wire.from.block, wire.from.port);
    const to = portKey(wire.to.block, wire.to.port);
    uf.union(from, to);
  }

  const rootToNet = new Map<PortKey, string>();
  let netCounter = 1;

  for (const block of blocks) {
    if (!isGround(block)) continue;
    const gndPorts = getBlockPorts(block);
    for (const p of gndPorts) {
      const root = uf.find(portKey(block.id, p));
      rootToNet.set(root, "0");
    }
  }

  function netName(pk: PortKey): string {
    const root = uf.find(pk);
    let name = rootToNet.get(root);
    if (!name) {
      name = `n${netCounter++}`;
      rootToNet.set(root, name);
    }
    return name;
  }

  const modelCards: string[] = [];
  const usedModels = new Set<string>();

  for (const block of blocks) {
    if (isGround(block)) continue;

    const refdes = block.label || `${spicePrefix(block.type)}?`;
    const type = block.type.toLowerCase();

    const params = block.params ?? {};
    const ic = block.ic ?? {};

    if (type.includes("resistor")) {
      const r = params.R ?? 1000;
      const ports = getBlockPorts(block);
      const np = netName(portKey(block.id, ports[0] ?? "p"));
      const nn = netName(portKey(block.id, ports[1] ?? "n"));
      lines.push(`${refdes} ${np} ${nn} ${r}`);
    } else if (type.includes("capacitor")) {
      const c = params.C ?? 1e-6;
      const ports = getBlockPorts(block);
      const np = netName(portKey(block.id, ports[0] ?? "p"));
      const nn = netName(portKey(block.id, ports[1] ?? "n"));
      let line = `${refdes} ${np} ${nn} ${c}`;
      if (ic.V !== undefined) line += ` IC=${ic.V}`;
      lines.push(line);
    } else if (type.includes("inductor")) {
      const l = params.L ?? 1e-6;
      const ports = getBlockPorts(block);
      const np = netName(portKey(block.id, ports[0] ?? "p"));
      const nn = netName(portKey(block.id, ports[1] ?? "n"));
      let line = `${refdes} ${np} ${nn} ${l}`;
      if (params.IC !== undefined && params.IC !== 0) line += ` IC=${params.IC}`;
      lines.push(line);
    } else if (type.includes("diode")) {
      const ports = getBlockPorts(block);
      const np = netName(portKey(block.id, ports[0] ?? "p"));
      const nn = netName(portKey(block.id, ports[1] ?? "n"));
      const modelName = String(params.model || "D_DEFAULT");
      lines.push(`${refdes} ${np} ${nn} ${modelName}`);
      if (!usedModels.has(modelName)) {
        usedModels.add(modelName);
        modelCards.push(`.MODEL ${modelName} D`);
      }
    } else if (type.includes("bjt")) {
      const ports = getBlockPorts(block);
      const nc = netName(portKey(block.id, ports[0] ?? "c"));
      const nb = netName(portKey(block.id, ports[1] ?? "b"));
      const ne = netName(portKey(block.id, ports[2] ?? "e"));
      const polarity = type.includes("pnp") ? "PNP" : "NPN";
      const modelName = String(params.model || `Q_${polarity}`);
      lines.push(`${refdes} ${nc} ${nb} ${ne} ${modelName}`);
      if (!usedModels.has(modelName)) {
        usedModels.add(modelName);
        modelCards.push(`.MODEL ${modelName} ${polarity}`);
      }
    } else if (type.includes("mosfet")) {
      const ports = getBlockPorts(block);
      const nd = netName(portKey(block.id, ports[0] ?? "d"));
      const ng = netName(portKey(block.id, ports[1] ?? "g"));
      const ns = netName(portKey(block.id, ports[2] ?? "s"));
      const polarity = type.includes("mosfet_p") || type.includes("mosfet.p") ? "PMOS" : "NMOS";
      const modelName = String(params.model || `M_${polarity}`);
      const w = params.W ?? 1e-6;
      const l = params.L ?? 1e-7;
      lines.push(`${refdes} ${nd} ${ng} ${ns} ${ns} ${modelName} W=${w} L=${l}`);
      if (!usedModels.has(modelName)) {
        usedModels.add(modelName);
        modelCards.push(`.MODEL ${modelName} ${polarity}`);
      }
    } else if (type.includes("voltage") && type.includes("source")) {
      const ports = getBlockPorts(block);
      const np = netName(portKey(block.id, ports[0] ?? "p"));
      const nn = netName(portKey(block.id, ports[1] ?? "n"));
      const card = renderSourceCard(block, params, "V", ["V1", "V2"], errors, "Voltage source");
      lines.push(`${refdes} ${np} ${nn} ${card}`);
    } else if (type.includes("current") && type.includes("source")) {
      const ports = getBlockPorts(block);
      const np = netName(portKey(block.id, ports[0] ?? "p"));
      const nn = netName(portKey(block.id, ports[1] ?? "n"));
      const card = renderSourceCard(block, params, "I", ["I1", "I2"], errors, "Current source");
      lines.push(`${refdes} ${np} ${nn} ${card}`);
    } else if (type.includes("vcvs")) {
      const ports = getBlockPorts(block);
      const nop = netName(portKey(block.id, ports[0] ?? "op"));
      const non = netName(portKey(block.id, ports[1] ?? "on"));
      const nip = netName(portKey(block.id, ports[2] ?? "ip"));
      const nin = netName(portKey(block.id, ports[3] ?? "in"));
      const gain = params.gain ?? 1;
      lines.push(`${refdes} ${nop} ${non} ${nip} ${nin} ${gain}`);
    } else if (type.includes("vccs")) {
      const ports = getBlockPorts(block);
      const nop = netName(portKey(block.id, ports[0] ?? "op"));
      const non = netName(portKey(block.id, ports[1] ?? "on"));
      const nip = netName(portKey(block.id, ports[2] ?? "ip"));
      const nin = netName(portKey(block.id, ports[3] ?? "in"));
      const gm = params.gm ?? 1;
      lines.push(`${refdes} ${nop} ${non} ${nip} ${nin} ${gm}`);
    } else {
      errors.push(`Unsupported block type: ${block.type} (${refdes})`);
      lines.push(`* UNSUPPORTED: ${refdes} (${block.type})`);
    }
  }

  if (modelCards.length > 0) {
    lines.push("");
    for (const card of modelCards) {
      lines.push(card);
    }
  }

  lines.push("");
  if (analysis.type === "TRAN") {
    const tEnd = analysis.tEnd ?? 0.01;
    const tStep = analysis.tStep ?? tEnd / 1000;
    lines.push(`.TRAN ${tStep} ${tEnd}`);
  } else if (analysis.type === "OP") {
    lines.push(".OP");
  } else if (analysis.type === "AC") {
    lines.push(".AC DEC 100 1 1MEG");
  } else if (analysis.type === "DC") {
    lines.push(".DC V1 0 5 0.1");
  }

  lines.push(".END");
  lines.push("");

  return { netlist: lines.join("\n"), errors };
}

function isGround(block: Block): boolean {
  return block.type.includes("ground");
}

function getBlockPorts(block: Block): string[] {
  const t = block.type.toLowerCase();
  if (t.includes("ground")) return ["gnd"];
  if (t.includes("resistor")) return ["p", "n"];
  if (t.includes("capacitor")) return ["p", "n"];
  if (t.includes("inductor")) return ["p", "n"];
  if (t.includes("diode")) return ["p", "n"];
  if (t.includes("bjt")) return ["c", "b", "e"];
  if (t.includes("mosfet")) return ["d", "g", "s"];
  if (t.includes("jfet")) return ["d", "g", "s"];
  if (t.includes("mesfet")) return ["d", "g", "s"];
  if (t.includes("vcvs") || t.includes("vccs")) return ["op", "on", "ip", "in"];
  if (t.includes("cccs") || t.includes("ccvs")) return ["op", "on", "ip", "in"];
  if (t.includes("voltage") || t.includes("current")) return ["p", "n"];
  if (t.includes("switch")) return ["p", "n", "cp", "cn"];
  return ["p", "n"];
}

/**
 * Best-effort detection of the top-level analysis card in an imported raw
 * netlist (.tran/.ac/.dc/.noise/.op), so signals get tagged with the
 * analysis that actually ran instead of whatever the UI's analysis-type
 * dropdown happened to be set to. ngspice/Xyce execute the netlist's own
 * cards regardless of what we detect here — this only affects manifest
 * metadata (axis labels, Bode-mode detection, unit display), not the
 * simulation itself. Scans for the first top-level card in file order; a
 * netlist declaring multiple analysis cards (rare — most declare exactly
 * one) only gets tagged with the first one found.
 */
export function detectAnalysisTypeFromNetlist(
  netlist: string,
): "TRAN" | "AC" | "DC" | "OP" | "NOISE" {
  for (const rawLine of netlist.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("*")) continue;
    const match = /^\.(tran|ac|dc|noise|op)\b/i.exec(trimmed);
    if (!match) continue;
    const card = (match[1] ?? "").toLowerCase();
    if (card === "tran") return "TRAN";
    if (card === "ac") return "AC";
    if (card === "dc") return "DC";
    if (card === "noise") return "NOISE";
    if (card === "op") return "OP";
  }
  return "TRAN";
}
