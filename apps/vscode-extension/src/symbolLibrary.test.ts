import { describe, expect, it } from "vitest";

import { SYMBOLS_DIR, SymbolLibraryError, symbolFileName } from "./symbolLibrary-core";

/**
 * `loadSymbols` / `saveSymbol` go through `vscode.workspace.fs`, which only
 * exists inside an extension host — they are exercised by the integration
 * suite. What is worth pinning down here is the part that decides a path from
 * a user-supplied string.
 */
describe("symbolFileName", () => {
  it("names the file after the component id", () => {
    expect(symbolFileName("user.my_component")).toBe("user.my_component.gsim_sym");
  });

  it("accepts a deeper namespace", () => {
    expect(symbolFileName("user.power.shunt_v2")).toBe("user.power.shunt_v2.gsim_sym");
  });

  it("rejects a bare name with no namespace", () => {
    // The id is a catalog key, not a display name.
    expect(() => symbolFileName("shunt")).toThrow(SymbolLibraryError);
  });

  it("rejects path traversal rather than sanitising it", () => {
    // Rewriting this into something writable would save the component under
    // the wrong catalog key *and* write outside the workspace. The id is
    // validated, never repaired.
    expect(() => symbolFileName("../../etc/passwd")).toThrow(SymbolLibraryError);
    expect(() => symbolFileName("user/../../escape")).toThrow(SymbolLibraryError);
  });

  it("rejects separators, spaces and upper case", () => {
    for (const bad of ["user/comp", "user comp", "User.Comp", "user.", ".user", "user..comp"]) {
      expect(() => symbolFileName(bad), bad).toThrow(SymbolLibraryError);
    }
  });

  it("names the folder components live in", () => {
    expect(SYMBOLS_DIR).toBe(".gsim/symbols");
  });
});
