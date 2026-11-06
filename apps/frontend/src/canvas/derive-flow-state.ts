import type { Edge, Node } from "reactflow";

import { refdesPrefix } from "../library/refdes";
import type { BlockMetadata } from "../model/types";
import type { Block, Wire } from "../model/types";
import { useLibraryStore } from "../store";
import { activeSubcktDefsFromStore } from "./model-mutation";
import { SYMBOL_SCALE } from "./nodes/port-hit-test";
import { resolveBlockBbox } from "./nodes/resolve-ports";
import { resolveBlockMetadata } from "./subckt-metadata";

export interface FlowBlockData {
  block: Block;
  metadata: BlockMetadata | null;
  /**
   * What the symbol prints above itself: the author's own label when there is
   * one, otherwise a derived reference designator. See `deriveDisplayLabels`.
   */
  displayLabel?: string;
}

/**
 * Types that are physical parts but carry no designator on a real schematic.
 * A ground is drawn, never named; a probe and a junction are annotations.
 */
const UNDESIGNATED = /ground|junction|probe|annotation|\bnode\b/;

/**
 * Reference designators for every physical part that has no authored label.
 *
 * A document written by hand or emitted by a script usually has no `label` on
 * its blocks — the buck converter in `docs/circuit_test/` has none — and the
 * renderer then drew each part with its value and nothing else. A schematic
 * where you cannot say "the current through L1" is not finished, and every
 * CAD tool assigns the designator at placement time rather than asking.
 *
 * Numbering is derived, not stored: it runs over `blocks` in document order,
 * so it is stable for a given document and identical in every view of it,
 * and it steps over any designator an author already used by hand so a
 * derived `R2` can never collide with an authored `R2` later in the sheet.
 *
 * Signal-flow blocks are left alone. Their symbol already prints the type's
 * own caption (`PID`, `Σ`, `1/s`), which says more than `Pid1` would.
 */
export function deriveDisplayLabels(blocks: Block[]): Map<string, string> {
  const labels = new Map<string, string>();
  const taken = new Set<string>();
  for (const block of blocks) {
    const authored = block.label?.trim();
    if (authored) {
      taken.add(authored);
    }
  }

  const nextIndex = new Map<string, number>();
  for (const block of blocks) {
    const authored = block.label?.trim();
    if (authored) {
      labels.set(block.id, authored);
      continue;
    }
    if (block.paradigm !== "physical-network" || UNDESIGNATED.test(block.type.toLowerCase())) {
      continue;
    }
    const prefix = refdesPrefix(block.type);
    let index = (nextIndex.get(prefix) ?? 0) + 1;
    while (taken.has(`${prefix}${index}`)) {
      index += 1;
    }
    nextIndex.set(prefix, index);
    taken.add(`${prefix}${index}`);
    labels.set(block.id, `${prefix}${index}`);
  }
  return labels;
}

function labelForBlock(block: Block, metadata: BlockMetadata | null): string {
  if (!metadata) {
    return block.type;
  }
  const symbolText = metadata.symbol.text;
  if (!symbolText) {
    return metadata.label;
  }
  return symbolText.replace(/\{([a-z][a-z0-9_]*)\}/gi, (_, name: string) =>
    String(block.params[name] ?? `{${name}}`),
  );
}

export function deriveFlowNodes(blocks: Block[]): Array<Node<FlowBlockData>> {
  const catalog = useLibraryStore.getState().catalog;
  const subcktDefs = activeSubcktDefsFromStore();
  const displayLabels = deriveDisplayLabels(blocks);
  return blocks.map((block) => {
    const metadata = resolveBlockMetadata(block, catalog, subcktDefs);
    const baseBbox: [number, number] =
      block.type === "routing.junction"
        ? [1, 1]
        : metadata
          ? resolveBlockBbox(metadata, block.params)
          : [96, 48];
    const bbox: [number, number] =
      block.rotation === 90 || block.rotation === 270 ? [baseBbox[1], baseBbox[0]] : baseBbox;
    return {
      id: block.id,
      type: "block",
      position: { x: block.position[0], y: block.position[1] },
      data: { block, metadata, displayLabel: displayLabels.get(block.id) },
      draggable: true,
      selectable: true,
      style: {
        width: bbox[0] * SYMBOL_SCALE,
        height: bbox[1] * SYMBOL_SCALE,
        border: "0",
        background: "transparent",
      },
      ariaLabel:
        block.type === "routing.junction"
          ? "wire junction"
          : `${metadata?.label ?? block.type}: ${labelForBlock(block, metadata)}`,
    };
  });
}

export function deriveFlowEdges(
  wires: Wire[],
  hops?: Map<string, Array<{ at: [number, number] }>>,
): Edge[] {
  return wires.map((wire) => ({
    id: wire.id,
    source: wire.from.block,
    target: wire.to.block,
    sourceHandle: wire.from.port,
    targetHandle: wire.to.port,
    type: "wire",
    animated: false,
    selectable: true,
    deletable: false,
    data: { wire, hops: hops?.get(wire.id) ?? [] },
    label: wire.pinned ? "pinned" : undefined,
  }));
}
