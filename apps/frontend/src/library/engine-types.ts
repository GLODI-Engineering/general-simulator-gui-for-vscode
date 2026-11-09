import engineCatalog from "./engine-catalog.json";

/**
 * Which engine type a component compiles to, and whether it compiles at all.
 *
 * This file used to hold a hand-written map of 26 catalogue types onto engine types, checked
 * pair by pair. The map is gone: the engine declares the component library itself, and every
 * component in it says what it compiles to. There is nothing left here to drift — these are
 * lookups over the engine's own answer, built once.
 *
 * The lookup accepts every spelling a component answers to. A sheet saved before the library
 * was unified names a resistor `physical-electrical.passive.resistor`; the engine calls it
 * `passive.resistor`, and keeps the older spellings as aliases so saved work still resolves.
 */

interface CatalogRecord {
  metadata: {
    name?: string;
    type?: string;
    engineId: string;
    engineType: string | null;
    compilable: boolean;
    aliases?: string[];
  };
}

const RECORDS = (engineCatalog as CatalogRecord[]).map((entry) => entry.metadata);

/** Every spelling a component answers to -> that component. */
const BY_NAME = new Map<string, (typeof RECORDS)[number]>();
for (const record of RECORDS) {
  for (const spelling of [record.engineId, record.type, record.name, ...(record.aliases ?? [])]) {
    // First writer wins: `engineId` is the canonical spelling, so a component never loses its
    // own identity to another component's alias.
    if (spelling && !BY_NAME.has(spelling)) BY_NAME.set(spelling, record);
  }
}

/** The component a block type names, under any spelling it answers to. */
export function componentFor(blockType: string): (typeof RECORDS)[number] | undefined {
  return BY_NAME.get(blockType);
}

/** The engine type a block compiles to, or `undefined` when the engine has no model for it. */
export function engineTypeOf(blockType: string): string | undefined {
  return componentFor(blockType)?.engineType ?? undefined;
}

/** Whether the engine declares it can compile this block. */
export function isCompilable(blockType: string): boolean {
  return componentFor(blockType)?.compilable ?? false;
}

/** Every component the engine declares, for callers that want to enumerate rather than ask. */
export function engineComponents(): ReadonlyArray<(typeof RECORDS)[number]> {
  return RECORDS;
}
