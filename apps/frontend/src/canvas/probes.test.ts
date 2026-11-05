import { describe, it } from "vitest";

// FE-105 — V/I probe model aligned to .gsim_sch (not editor-only JSON)
// Scaffold-only tests. Implement full assertions from progress.frontend.yaml acceptance bullets.
// Acceptance checklist:
// - test_v_probe_single_and_pair: one wire -> V(node); paired wire -> V(node1,node2).
// - test_i_probe_component: component double-click -> I(refdes).
// - test_roundtrip: probes survive a .gsim_sch save/load roundtrip and validate against the schema.
// - test_delete_via_keymap: the keymap delete action removes a selected probe.

describe("FE-105 scaffold", () => {
  it.todo("implement acceptance coverage");
});
