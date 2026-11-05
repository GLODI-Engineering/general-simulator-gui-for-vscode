/**
 * FE-138: deserialize() must accept boolean block params.
 *
 * Regression for a real user report: a saved .gsim_sch containing a
 * from_workspace block (whose `interpolate` param is declared `type: bool`
 * in packages/blocks/.../metadata.yaml) failed to reopen with
 * "/model/blocks/1/params/interpolate: must be number" — the runtime
 * ParamValue schema (packages/schemas/definitions/model/gsim_sch.schema.json)
 * only allowed number/string, never boolean, even though several blocks in
 * the catalog (from_workspace, bjt_npn, bjt_pnp, pid) declare bool params.
 */

import { describe, expect, it } from "vitest";
import { deserialize } from "./deserializer";

function docWithParam(paramValue: unknown): string {
  return JSON.stringify({
    schema_version: 2,
    model: {
      id: "model-1",
      name: "Untitled model",
      grid: 10,
      params: [],
      blocks: [
        {
          id: "block-1",
          type: "signal_flow.source.from_workspace",
          label: "From_workspace1",
          domain: "signal",
          paradigm: "signal-flow",
          fidelity: "n_a",
          position: [0, 0],
          rotation: 0,
          mirror: "none",
          params: { variable_name: "u", sample_time: 0, interpolate: paramValue },
          ic: {},
        },
      ],
      wires: [],
      lines: [],
      nets: [],
      simulation: {},
      metadata: {},
    },
  });
}

describe("FE-138: ParamValue accepts booleans", () => {
  it("deserialize: a boolean param value (e.g. interpolate: true) does not throw", () => {
    const doc = deserialize(docWithParam(true));
    expect(doc.model.blocks[0]?.params.interpolate).toBe(true);
  });

  it("deserialize: a boolean param value of false round-trips too", () => {
    const doc = deserialize(docWithParam(false));
    expect(doc.model.blocks[0]?.params.interpolate).toBe(false);
  });

  it("deserialize: numeric and string param values still work (no regression)", () => {
    expect(deserialize(docWithParam(1)).model.blocks[0]?.params.interpolate).toBe(1);
    expect(deserialize(docWithParam("{u}")).model.blocks[0]?.params.interpolate).toBe("{u}");
  });
});
