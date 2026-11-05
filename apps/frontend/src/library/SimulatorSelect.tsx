import { useLibraryStore } from "../store/library";
import { loadSimulatorCompat } from "./simulator-compat";

const { simulators } = loadSimulatorCompat();

export function SimulatorSelect() {
  const activeSimulator = useLibraryStore((state) => state.activeSimulator);
  const setActiveSimulator = useLibraryStore((state) => state.setActiveSimulator);

  return (
    <select
      className="simulator-select"
      value={activeSimulator}
      onChange={(event) => {
        setActiveSimulator(event.target.value);
      }}
      aria-label="Simulator compatibility filter"
    >
      <option value="all">All simulators</option>
      {simulators.map((sim) => (
        <option key={sim.id} value={sim.id}>
          {sim.label}
        </option>
      ))}
    </select>
  );
}
