import { describe, expect, it } from "vitest";

import * as shared from "@gensim/webview-protocol";

import { GSIM_INIT_GLOBAL, isHostBoundMessage } from "./protocol";

/**
 * The message union lives in `@gensim/webview-protocol` and is re-exported from
 * `protocol.ts` as types, which are erased — so nothing from `node_modules` is
 * required at runtime, which matters because `vsce package --no-dependencies`
 * ships none of it.
 *
 * The price is that the two *runtime* values are local copies. This is what
 * keeps them from drifting, since the type system cannot: a copy that disagrees
 * with the package is exactly the bug the consolidation was meant to end.
 */
describe("the extension's local protocol values match the shared package", () => {
  it("GSIM_INIT_GLOBAL is the same string", () => {
    expect(GSIM_INIT_GLOBAL).toBe(shared.GSIM_INIT_GLOBAL);
  });

  it("isHostBoundMessage agrees on every case the shared one is given", () => {
    const cases: unknown[] = [
      { type: "gsim/ready" },
      { type: "gsim/readSource", requestId: "1", path: "a.py" },
      { type: "other/thing" },
      { type: 42 },
      {},
      null,
      undefined,
      "gsim/ready",
      [],
    ];
    for (const value of cases) {
      expect(isHostBoundMessage(value), `disagreed on ${JSON.stringify(value)}`).toBe(
        shared.isHostBoundMessage(value),
      );
    }
  });
});
