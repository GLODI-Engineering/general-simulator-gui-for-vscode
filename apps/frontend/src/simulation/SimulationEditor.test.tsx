import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Simulation } from "../model/types";
import { useGraphStore } from "../store";
import { SimulationEditor } from "./SimulationEditor";

afterEach(cleanup);

beforeEach(() => {
  useGraphStore.setState(useGraphStore.getInitialState());
});

function loadModelWithSimulation(simulation: Simulation, nets: string[] = []) {
  useGraphStore.getState().loadDocument({
    schema_version: 2,
    model: {
      id: "model-1",
      name: "Untitled",
      grid: 10,
      params: [],
      blocks: [],
      wires: [],
      lines: [],
      nets: nets.map((name) => ({ name, kind: "electrical", scope: "local" as const })),
      simulation,
      metadata: {},
    },
  });
}

describe("FE-61: SimulationEditor", () => {
  it("test_add_analysis: adding two analyses produces two entries with distinct ids; default_analysis defaults to the first", () => {
    loadModelWithSimulation({ analyses: [], default_analysis: null });

    render(<SimulationEditor />);

    const addButton = screen.getByRole("button", { name: /add analysis/i });
    fireEvent.click(addButton);
    fireEvent.click(addButton);

    const sim = useGraphStore.getState().document.model.simulation;
    const analyses = sim.analyses ?? [];

    expect(analyses).toHaveLength(2);
    expect(analyses[0]?.id).not.toBe(analyses[1]?.id);
    expect(sim.default_analysis).toBe(analyses[0]?.id ?? null);
  });

  it("test_ic_node_autocomplete: typing in the node IC field suggests existing net names from model.nets", () => {
    loadModelWithSimulation({ analyses: [{ id: "tr1", type: "TRAN" }] }, ["vin", "vout", "gnd"]);

    render(<SimulationEditor />);

    fireEvent.click(screen.getByRole("tab", { name: /initial conditions/i }));

    const netInput = screen.getByLabelText(/net name/i);
    fireEvent.change(netInput, { target: { value: "v" } });

    const listId = netInput.getAttribute("list");
    expect(listId).toBeTruthy();

    const dataList = document.getElementById(listId ?? "");
    const optionValues = Array.from(dataList?.querySelectorAll("option") ?? []).map((opt) =>
      opt.getAttribute("value"),
    );

    expect(optionValues).toEqual(expect.arrayContaining(["vin", "vout", "gnd"]));
  });
});
