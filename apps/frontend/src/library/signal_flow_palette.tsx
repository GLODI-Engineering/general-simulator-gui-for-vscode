import { useState } from "react";

const GROUPS = [
  [
    "Sources",
    ["signal-flow.source.constant", "signal-flow.source.step", "signal-flow.source.ramp"],
  ],
  ["Math", ["signal-flow.math.gain", "signal-flow.math.sum", "signal-flow.math.product"]],
  ["Continuous", ["signal-flow.continuous.integrator", "signal-flow.continuous.derivative"]],
  ["Discrete", ["signal-flow.discrete.unit_delay", "signal-flow.discrete.delay"]],
  ["Discontinuity", ["signal-flow.discontinuity.saturation", "signal-flow.discontinuity.relay"]],
  ["Logic", ["signal-flow.logic.and", "signal-flow.logic.or", "signal-flow.logic.not"]],
  ["Lookup", ["signal-flow.lookup.1d", "signal-flow.lookup.2d"]],
  ["Sinks", ["signal-flow.sink.scope", "signal-flow.sink.to_workspace"]],
  [
    "Routing",
    [
      "routing.mux",
      "routing.demux",
      "routing.bus_creator",
      "routing.bus_selector",
      "routing.bus_assignment",
      "routing.selector",
      "routing.merge",
      "routing.manual_switch",
      "routing.multiport_switch",
      "routing.switch",
      "routing.data_store_memory",
      "routing.data_store_read",
      "routing.data_store_write",
    ],
  ],
] as const;

function labelFor(type: string): string {
  return type.split(".").at(-1) ?? type;
}

export function SignalFlowPalette() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  return (
    <section className="library-activity" aria-label="Signal flow palette">
      <header className="library-activity__header">
        <strong>Signal flow</strong>
      </header>
      <input
        type="search"
        aria-label="Search signal flow blocks"
        placeholder="Search signal flow blocks"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <div className="library-tree">
        {GROUPS.map(([group, types]) => {
          const visible = types.filter((type) =>
            `${type} ${labelFor(type)}`.toLowerCase().includes(normalized),
          );
          if (visible.length === 0) return null;
          return (
            <section key={group} className="library-tree__section">
              <h3>{group}</h3>
              {visible.map((type) => (
                <div key={type} className="library-item">
                  <span className="library-item__label">{labelFor(type)}</span>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </section>
  );
}

export default SignalFlowPalette;
