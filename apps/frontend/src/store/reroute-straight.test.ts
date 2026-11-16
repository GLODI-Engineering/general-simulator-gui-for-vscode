import { beforeEach, describe, expect, it } from "vitest";

import { loadCatalogFromManifest } from "../library/catalog";
import type { Block, Model, Wire } from "../model/types";
import { rerouteWiresForBlocks } from "./graph";
import { useLibraryStore } from "./library";

/**
 * A wire between two pins that already line up must stay straight.
 *
 * Reported from a photograph: a wire arriving at a junction climbed a grid
 * step, ran across, and came back down — a little staple standing above the
 * node — and the same step appeared at ordinary pins. The geometry was exact
 * in every case, so the detour was being written by the re-router, not by the
 * placement.
 */
function block(id: string, type: string, position: [number, number], rotation = 0): Block {
  return {
    id,
    type,
    paradigm: "physical-network",
    domain: "physical-electrical",
    fidelity: "ideal",
    position,
    rotation,
    mirror: "none",
    params: { R: 10 },
    ic: {},
  };
}

function wire(id: string, fb: string, fp: string, tb: string, tp: string): Wire {
  return {
    id,
    from: { block: fb, port: fp },
    to: { block: tb, port: tp },
    waypoints: [],
    pinned: false,
    net: null,
    kind: "physical-electrical",
  };
}

describe("rerouteWiresForBlocks", () => {
  beforeEach(() => {
    useLibraryStore.setState({ catalog: loadCatalogFromManifest() });
  });

  it("leaves a wire straight when its two pins are already in line", () => {
    const junction: Block = {
      ...block("J", "routing.junction", [482, 240]),
      paradigm: "routing",
      fidelity: "n_a",
      params: {},
    };
    const model = {
      id: "m",
      name: "m",
      grid: 20,
      params: [],
      blocks: [
        block("R1", "passive.resistor", [242, 200]),
        block("R2", "passive.resistor", [602, 200]),
        junction,
      ],
      wires: [wire("w1", "R1", "n", "J", "node"), wire("w2", "R2", "p", "J", "node")],
      lines: [],
      nets: [],
      simulation: {},
      metadata: {},
    } as unknown as Model;

    rerouteWiresForBlocks(model, new Set(["R1", "R2", "J"]));

    for (const w of model.wires) {
      // Any waypoint at all on a straight run is a detour around nothing.
      expect(w.waypoints, `${w.id} gained waypoints: ${JSON.stringify(w.waypoints)}`).toEqual([]);
    }
  });
});
