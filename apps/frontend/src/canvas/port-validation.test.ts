import { beforeEach, describe, expect, it } from "vitest";

import type { BlockMetadata } from "../model/types";
import { useGraphStore, useIpcStore, useLibraryStore } from "../store";
import { installPortValidation, publishPortProblems, resetPortValidation } from "./port-validation";

function meta(name: string, ports: string[]): BlockMetadata {
  return {
    name,
    label: name,
    domain: "physical-electrical",
    ports: { inputs: ports.map((id) => ({ id, kind: { domain: "physical-electrical" } })) },
    params: [],
  } as unknown as BlockMetadata;
}

function setSheet(wirePort: string) {
  const doc = useGraphStore.getState().document;
  useGraphStore.setState({
    document: {
      ...doc,
      model: {
        ...doc.model,
        blocks: [
          { id: "R1", type: "passive.resistor" },
          { id: "G1", type: "routing.ground" },
        ],
        wires: [
          { id: "w1", from: { block: "R1", port: "n" }, to: { block: "G1", port: wirePort } },
        ],
      },
    },
  } as never);
}

beforeEach(() => {
  resetPortValidation();
  useIpcStore.setState({ problems: [] });
  useLibraryStore.setState({
    catalog: {
      "passive.resistor": meta("passive.resistor", ["p", "n"]),
      "routing.ground": meta("routing.ground", ["gnd"]),
    },
  } as never);
});

describe("port validation reaches the Problems panel", () => {
  it("raises a problem for a wire naming a port that does not exist", () => {
    setSheet("p");
    publishPortProblems();
    const problems = useIpcStore.getState().problems;
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('"p"');
  });

  it("says nothing about a correct sheet", () => {
    setSheet("gnd");
    publishPortProblems();
    expect(useIpcStore.getState().problems).toHaveLength(0);
  });

  /** A run's validation errors share this panel and must survive an edit. */
  it("leaves problems raised elsewhere alone", () => {
    useIpcStore.setState({
      problems: [{ id: "validation-1", severity: "error", message: "Incompatible port types" }],
    } as never);
    setSheet("p");
    publishPortProblems();
    const ids = useIpcStore.getState().problems.map((p) => p.id);
    expect(ids).toContain("validation-1");
    expect(ids.some((id) => id.startsWith("unknown-port:"))).toBe(true);
  });

  it("clears its own problems once the sheet is fixed", () => {
    setSheet("p");
    publishPortProblems();
    expect(useIpcStore.getState().problems).toHaveLength(1);
    setSheet("gnd");
    publishPortProblems();
    expect(useIpcStore.getState().problems).toHaveLength(0);
  });

  it("re-checks when the document changes, without being asked", () => {
    setSheet("gnd");
    installPortValidation();
    expect(useIpcStore.getState().problems).toHaveLength(0);
    setSheet("p");
    expect(useIpcStore.getState().problems).toHaveLength(1);
  });
});
