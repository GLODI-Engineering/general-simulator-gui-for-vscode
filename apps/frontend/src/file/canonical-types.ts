import { componentFor } from "../library/engine-types";
import type { Block, Model, ModelDocument } from "../model/types";

/**
 * Rewrite every block's `type` to the spelling the compiler will accept.
 *
 * The engine's catalogue gives each component a canonical `name` plus a list
 * of `aliases` — older spellings, so a sheet saved last year still resolves.
 * The front end honours those aliases everywhere: the palette finds the
 * component, the symbol draws, and `supportsBlock` reports it as compilable.
 *
 * The compiler does not. gsim-core's netlist emitter looks the block type up
 * in its registry by canonical name only, and answers an alias with
 * `unknown-type: block 'V1' has type '...', which no netlist emitter knows`.
 *
 * So an aliased document used to pass every check the app could make and then
 * fail at the one moment it mattered, with an error naming a type the user had
 * never typed. Nothing the app showed was wrong; the two halves simply
 * disagreed about what a component is called.
 *
 * Resolving aliases once, here, is what makes them harmless. `deserialize` is
 * the single door every document comes through — import, IndexedDB, and the
 * VS Code host all funnel into it — so after this point only canonical names
 * exist and the question cannot be asked again.
 *
 * A type the engine has never heard of is left exactly as written. It is not
 * ours to invent a spelling for, and the palette already says plainly that the
 * simulator cannot compile it.
 */
function canonicalTypeOf(blockType: string): string {
  return componentFor(blockType)?.name ?? blockType;
}

function canonicalizeBlock(block: Block): Block {
  const canonical = canonicalTypeOf(block.type);
  const body = block.subsystem ? canonicalizeModel(block.subsystem) : undefined;
  if (canonical === block.type && body === block.subsystem) return block;
  const next: Block = { ...block, type: canonical };
  if (body) next.subsystem = body;
  return next;
}

function canonicalizeModel(model: Model): Model {
  // A subsystem body holds real blocks, and they reach the same compiler the
  // root sheet does. Rewriting only the top level would leave a document that
  // compiles until somebody opens a group.
  let changed = false;
  const blocks = model.blocks.map((block) => {
    const next = canonicalizeBlock(block);
    if (next !== block) changed = true;
    return next;
  });
  return changed ? { ...model, blocks } : model;
}

/** Every block in the document, at every depth, named as the compiler names it. */
export function canonicalizeBlockTypes(document: ModelDocument): ModelDocument {
  const model = canonicalizeModel(document.model);
  return model === document.model ? document : { ...document, model };
}
