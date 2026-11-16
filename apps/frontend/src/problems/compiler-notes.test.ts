import { beforeEach, describe, expect, it } from "vitest";

import { useIpcStore } from "../store";
import { compilerNoteProblems, publishCompilerNotes } from "./compiler-notes";

describe("compiler notes in the problems panel", () => {
  beforeEach(() => {
    useIpcStore.getState().setProblems([]);
  });

  it("reports each note as info, never as an error", () => {
    const out = compilerNoteProblems(["node 'x' has no DC path to ground; added a reference"]);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("info");
    expect(out[0].message).toContain("no DC path to ground");
  });

  it("leaves problems raised by other producers alone", () => {
    useIpcStore
      .getState()
      .setProblems([{ id: "unknown-port:w1", severity: "error", message: "bad port" }]);
    publishCompilerNotes(["added a DC reference"]);

    const ids = useIpcStore.getState().problems.map((p) => p.id);
    expect(ids).toContain("unknown-port:w1");
    expect(ids.some((id) => id.startsWith("compiler-note:"))).toBe(true);
  });

  it("clears the previous run's notes so one never outlives its fix", () => {
    publishCompilerNotes(["added a DC reference"]);
    expect(useIpcStore.getState().problems).toHaveLength(1);

    // The user wires the node to ground and runs again: the panel must go quiet.
    publishCompilerNotes([]);
    expect(useIpcStore.getState().problems).toHaveLength(0);
  });
});
