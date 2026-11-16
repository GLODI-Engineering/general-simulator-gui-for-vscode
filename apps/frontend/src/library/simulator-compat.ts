import { isCompilable } from "./engine-types";

/**
 * Which simulator a sheet is aimed at, and what it will honour.
 *
 * The backend is general-simulator. This file used to carry two hand-written
 * descriptions of it: a `supported` array of 59 engine type names copied from
 * gsim-core's compile registry, and a `deviceLevels` map saying which SPICE
 * `.MODEL` levels each device family offered. Both are gone.
 *
 * `supported` was already dead before it was deleted -- `supportsBlock` stopped
 * reading it and asked the engine instead, because the copy had drifted far
 * enough to match none of the catalogue's types and report every block on every
 * sheet as unsupported. A list that has to be re-typed whenever the engine
 * changes will be wrong, and it was.
 *
 * `deviceLevels` described ngspice's and Xyce's model cards. Those backends are
 * gone; general-simulator's devices are ideal and have no model card.
 */
export interface SimulatorCompat {
  id: string;
  label: string;
}

export interface SimulatorCompatMap {
  simulators: SimulatorCompat[];
}

const COMPAT_DATA: SimulatorCompatMap = {
  simulators: [{ id: "general-simulator", label: "General Simulator" }],
};

/** The contract for one simulator, or undefined if it is not configured. */
export function simulatorContract(simulatorId: string): SimulatorCompat | undefined {
  return COMPAT_DATA.simulators.find((entry) => entry.id === simulatorId);
}

/**
 * Whether this simulator can compile a block type.
 *
 * "all" is the palette's browse-everything mode rather than a simulator, so it
 * supports everything by construction.
 *
 * The answer is the engine's own: each component in the engine's library says
 * whether it can be compiled, derived there from the compile registry rather
 * than stored, so it cannot disagree with what a compile actually does.
 */
export function supportsBlock(simulatorId: string, blockType: string): boolean {
  if (simulatorId === "all") return true;
  if (!simulatorContract(simulatorId)) return true;
  return isCompilable(blockType);
}

export function loadSimulatorCompat(): SimulatorCompatMap {
  return COMPAT_DATA;
}
