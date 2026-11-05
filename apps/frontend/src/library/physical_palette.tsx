import { useState } from "react";

const GROUPS = [
  [
    "Electrical",
    ["physical-electrical.passive.resistor", "physical-electrical.semiconductor.mosfet_n"],
  ],
  [
    "Translational",
    ["physical-translational.element.mass", "physical-translational.element.spring"],
  ],
  ["Rotational", ["physical-rotational.element.inertia", "physical-rotational.element.damper"]],
  ["Thermal", ["physical-thermal.element.mass", "physical-thermal.element.conductor"]],
  ["Converters", ["converter.signal_to_physical_signal", "converter.physical_signal_to_signal"]],
] as const;

function labelFor(type: string): string {
  return type.split(".").at(-1) ?? type;
}

export function PhysicalPalette() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  return (
    <section className="library-activity" aria-label="Physical network palette">
      <header className="library-activity__header">
        <strong>Physical network</strong>
      </header>
      <input
        type="search"
        aria-label="Search physical network blocks"
        placeholder="Search physical network blocks"
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

export default PhysicalPalette;
