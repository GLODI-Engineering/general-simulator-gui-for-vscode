import { createBlockFromMetadata } from "../library/insert";
import type { Block, BlockMetadata, Wire } from "../model/types";
import { useGraphStore, useLibraryStore, useToastStore, useUiStore } from "../store";
import { getMetadataPortCenters } from "./nodes/port-hit-test";

type BuckPartKey = "vin" | "mosfet" | "inductor" | "capacitor" | "load";

interface BuckPart {
  key: BuckPartKey;
  aliases: string[];
}

type BuckCatalog = Record<BuckPartKey, BlockMetadata>;

const BUCK_PARTS: BuckPart[] = [
  {
    key: "vin",
    aliases: ["physical-electrical.source.voltage_dc", "physical_electrical.source.voltage_dc"],
  },
  {
    key: "mosfet",
    aliases: [
      "physical-electrical.semiconductor.mosfet_n",
      "physical_electrical.semiconductor.mosfet_n",
    ],
  },
  {
    key: "inductor",
    aliases: ["physical-electrical.passive.inductor", "passive.inductor"],
  },
  {
    key: "capacitor",
    aliases: ["physical-electrical.passive.capacitor", "passive.capacitor"],
  },
  {
    key: "load",
    aliases: ["physical-electrical.passive.resistor", "passive.resistor"],
  },
];

function resolvePartCatalog(): BuckCatalog | null {
  const catalog = useLibraryStore.getState().catalog;
  const resolved: Partial<BuckCatalog> = {};

  for (const part of BUCK_PARTS) {
    const metadata = part.aliases.map((alias) => catalog[alias]).find(Boolean);
    if (!metadata) {
      useToastStore
        .getState()
        .pushToast(`Buck schematic requires block type: ${part.aliases.join(" / ")}`);
      return null;
    }
    resolved[part.key] = metadata;
  }

  return resolved as BuckCatalog;
}

function portCenter(
  block: Block,
  metadata: BlockMetadata,
  portId: string,
): { x: number; y: number } {
  const center = getMetadataPortCenters(block, metadata).find((p) => p.id === portId)?.stubTip;
  if (!center) {
    throw new Error(`Port ${portId} not found on ${metadata.name}`);
  }
  return center;
}

function makeWire(
  from: { block: Block; metadata: BlockMetadata; port: string },
  to: { block: Block; metadata: BlockMetadata; port: string },
): Wire {
  const src = portCenter(from.block, from.metadata, from.port);
  const dst = portCenter(to.block, to.metadata, to.port);
  const midX = Math.round((src.x + dst.x) / 2 / 10) * 10;

  return {
    id: `wire-${crypto.randomUUID()}`,
    from: { block: from.block.id, port: from.port },
    to: { block: to.block.id, port: to.port },
    waypoints: [
      [midX, Math.round(src.y)],
      [midX, Math.round(dst.y)],
    ],
    pinned: false,
    net: null,
    kind: from.block.domain,
  };
}

function place(
  metadata: BlockMetadata,
  position: [number, number],
  rotation: Block["rotation"],
  label: string,
): Block {
  return {
    ...createBlockFromMetadata(metadata, position),
    rotation,
    label,
  };
}

/**
 * Synchronous buck converter matching the LTspice reference schematic:
 * - M1 (high-side NMOS): drain → Vin+, source → switching node, gate → V3
 * - M2 (low-side NMOS): drain → switching node, source → GND, gate → V2
 * - V1: input supply (Vin+ / GND)
 * - V3: M1 gate drive
 * - V2: M2 gate drive
 * - L1: switching node → output node
 * - C1, R1: output node → GND
 *
 * Layout (model coords, SYMBOL_SCALE=1.6):
 *   V1  [40,200] rot=90  → p=(72,200), n=(72,296)
 *   M1  [300,60]  rot=0  → d=(381.6,60), g=(300,189.6), s=(381.6,236)
 *   M2  [300,276] rot=0  → d=(381.6,276), g=(300,405.6), s=(381.6,452)
 *   V3  [120,160] rot=90 → p=(152,160), n=(152,256)
 *   V2  [120,376] rot=90 → p=(152,376), n=(152,472)
 *   L1  [500,244] rot=0  → p=(500,276), n=(596,276)
 *   C1  [680,200] rot=90 → p=(712,200), n=(712,296)
 *   R1  [820,200] rot=90 → p=(852,200), n=(852,296)
 */
export function insertBuckSchematic(): void {
  const parts = resolvePartCatalog();
  if (!parts) return;

  const v1 = place(parts.vin, [40, 200], 90, "V1");
  const m1 = place(parts.mosfet, [300, 60], 0, "M1");
  const m2 = place(parts.mosfet, [300, 276], 0, "M2");
  const v3 = place(parts.vin, [120, 160], 90, "V3");
  const v2 = place(parts.vin, [120, 376], 90, "V2");
  const l1 = place(parts.inductor, [500, 244], 0, "L1");
  const c1 = place(parts.capacitor, [680, 200], 90, "C1");
  const r1 = place(parts.load, [820, 200], 90, "R1");

  function ref(block: Block, metadata: BlockMetadata, port: string) {
    return { block, metadata, port };
  }

  const wires: Wire[] = [
    // Vin+ rail: V1.p → M1.drain
    makeWire(ref(v1, parts.vin, "p"), ref(m1, parts.mosfet, "d")),
    // Switching node: M1.source → M2.drain (vertical tie)
    makeWire(ref(m1, parts.mosfet, "s"), ref(m2, parts.mosfet, "d")),
    // Switching node → inductor input
    makeWire(ref(m2, parts.mosfet, "d"), ref(l1, parts.inductor, "p")),
    // Gate drives
    makeWire(ref(v3, parts.vin, "p"), ref(m1, parts.mosfet, "g")),
    makeWire(ref(v2, parts.vin, "p"), ref(m2, parts.mosfet, "g")),
    // Output node: inductor output → cap and load
    makeWire(ref(l1, parts.inductor, "n"), ref(c1, parts.capacitor, "p")),
    makeWire(ref(l1, parts.inductor, "n"), ref(r1, parts.load, "p")),
    // GND bus: V1.n → M2.source (GND backbone)
    makeWire(ref(v1, parts.vin, "n"), ref(m2, parts.mosfet, "s")),
    // V3 ground → V1.n
    makeWire(ref(v3, parts.vin, "n"), ref(v1, parts.vin, "n")),
    // V2 ground → M2.source
    makeWire(ref(v2, parts.vin, "n"), ref(m2, parts.mosfet, "s")),
    // Output returns → GND (M2.source)
    makeWire(ref(c1, parts.capacitor, "n"), ref(m2, parts.mosfet, "s")),
    makeWire(ref(r1, parts.load, "n"), ref(m2, parts.mosfet, "s")),
  ];

  const allBlocks = [v1, m1, m2, v3, v2, l1, c1, r1];

  const graph = useGraphStore.getState();
  graph.transact("insert buck schematic", () => {
    for (const block of allBlocks) graph.addBlock(block);
    for (const wire of wires) graph.addWire(wire);
  });

  useUiStore.getState().setSelection(allBlocks.map((b) => b.id));
  useToastStore
    .getState()
    .pushToast(
      "Synchronous buck schematic inserted (M1 high-side, M2 low-side, V3/V2 gate drives).",
    );
}

export default insertBuckSchematic;
