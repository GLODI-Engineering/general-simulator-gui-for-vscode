/**
 * Telling a measured trace apart from a computed one.
 *
 * A file source (`source.file`) replays a capture from a board: a scope
 * export, a logger dump, whatever was recorded. The engine evaluates it like
 * any other block, so what comes back is an ordinary signal with ordinary
 * samples, and the viewer had no way to know that one of the traces on the
 * chart was never computed at all.
 *
 * That matters more than labelling. The whole point of a file-backed source
 * is holding a simulation against a real board, and a chart where the two are
 * indistinguishable invites the one mistake that makes the comparison
 * worthless: reading the measurement as a result. So a measured trace is
 * drawn differently and says what it is, and the simulated trace stays the
 * solid one -- it is the thing being judged.
 *
 * What this does **not** do is re-derive the capture. The samples drawn are
 * the ones the engine itself evaluated, on the time base it used, with
 * whatever `tshift`, `scale` and `offset` the block declared already applied.
 * Reading the file a second time here would mean a second loader, and two
 * loaders disagreeing about a decimal comma is exactly the kind of difference
 * nobody would see on the chart.
 */
import { componentFor } from "../library/engine-types";
import type { Block } from "../model/types";

/**
 * The catalogue name of the block that replays a file.
 *
 * One name, not a prefix: `source.file` is a single component with one
 * fidelity tier, so a `startsWith` test would only invent a family that does
 * not exist and quietly claim the next `source.file_something` as a capture.
 */
export const FILE_SOURCE_TYPE = "source.file";

/**
 * Whether a block type is the file source, allowing for an alias.
 *
 * `deserialize` canonicalises every document it loads, so a block's `type` is
 * normally already `source.file`. A block built in memory -- by a test, by the
 * test hooks, by a path that has not been through the door -- can still carry
 * an older spelling, and the catalogue is what knows them.
 */
export function isFileSourceType(blockType: string): boolean {
  if (blockType === FILE_SOURCE_TYPE) return true;
  return componentFor(blockType)?.name === FILE_SOURCE_TYPE;
}

/**
 * The ids of every file-source block in a model, subsystem bodies included.
 *
 * A capture dropped inside a group is still a capture, and the signal it
 * produces reaches the viewer the same way. Walking only the top level would
 * mean a trace that is measured on one sheet and not on another.
 */
export function fileSourceBlockIds(blocks: Block[]): Set<string> {
  const found = new Set<string>();
  const walk = (list: Block[]) => {
    for (const block of list) {
      if (isFileSourceType(block.type)) found.add(block.id);
      if (block.subsystem?.blocks) walk(block.subsystem.blocks);
    }
  };
  walk(blocks);
  return found;
}

/**
 * Dash pattern for a measured trace: 6 px on, 4 px off.
 *
 * Long enough to read as deliberate at a glance rather than as a rendering
 * artefact, short enough that a switching edge still reads as an edge. The
 * colour is left alone: a capture and the simulation of the same quantity
 * belong to each other, and giving the measurement its own hue would make the
 * eye group by provenance instead of by signal -- the same reason a past run
 * keeps its signal's colour and only loses contrast.
 */
export const MEASURED_DASH = [6, 4];

/** The name a measured trace is shown under. */
export function measuredLabel(label: string): string {
  return `${label} (measured)`;
}
