/**
 * The parts of the user-component library that do not need the extension host.
 *
 * Split from `symbolLibrary.ts` for the same reason `kernel-core.ts` is split
 * from `kernel.ts`: anything importing `vscode` cannot be loaded under vitest,
 * so the logic worth unit-testing lives where a test can reach it.
 */

/** Where user components live, relative to the workspace folder. */
export const SYMBOLS_DIR = ".gsim/symbols";
export const SYMBOL_EXTENSION = ".gsim_sym";

/** A component type id is a dotted, lower-case namespace. */
const NAME_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export class SymbolLibraryError extends Error {}

/**
 * Filename for a component id.
 *
 * The id is validated rather than sanitised. A name is a namespace the
 * catalog keys on, so quietly rewriting `../../etc/passwd` into something
 * writable would both save the wrong thing and write outside the workspace.
 */
export function symbolFileName(name: string): string {
  if (!NAME_PATTERN.test(name)) {
    throw new SymbolLibraryError(
      `"${name}" is not a valid component id. Use a dotted lower-case namespace, e.g. "user.my_component".`,
    );
  }
  return `${name}${SYMBOL_EXTENSION}`;
}
