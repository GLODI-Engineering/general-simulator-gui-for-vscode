import { useMemo, useState } from "react";
import type { BlockMetadata } from "../model/types";
import { useLibraryStore, useUiStore } from "../store";
import { SidebarItem } from "./SidebarItem";
import { SimulatorSelect } from "./SimulatorSelect";
import { insertCatalogBlock } from "./insert";
import { loadSimulatorCompat } from "./simulator-compat";

const CATEGORY_ORDER = [
  "signal",
  "control",
  "power",
  "passive",
  "sources",
  "dependent",
  "semiconductor",
  "reference",
  "tline",
  "sinks",
  "subsystems",
  "user",
] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  signal: "Signal",
  control: "Control",
  power: "Physical Network",
  passive: "Passive",
  sources: "Sources",
  dependent: "Dependent Sources",
  semiconductor: "Semiconductor",
  reference: "Reference",
  tline: "Transmission Lines",
  sinks: "Sinks",
  subsystems: "Subsystems",
  user: "User",
};

type FamilyKey = "resistor" | "capacitor" | "inductor" | "voltage-source" | "current-source";

interface DisplayEntry {
  entry: BlockMetadata;
  variants: BlockMetadata[];
}

function familyKey(name: string): FamilyKey | null {
  if (
    name.startsWith("source.voltage.") ||
    name.startsWith("physical_electrical.source.voltage_")
  ) {
    return "voltage-source";
  }
  if (
    name.startsWith("source.current.") ||
    name.startsWith("physical_electrical.source.current_")
  ) {
    return "current-source";
  }
  if (name.startsWith("passive.resistor.") || name === "physical_electrical.passive.resistor") {
    return "resistor";
  }
  if (name.startsWith("passive.capacitor.") || name === "physical_electrical.passive.capacitor") {
    return "capacitor";
  }
  if (name.startsWith("passive.inductor.") || name === "physical_electrical.passive.inductor") {
    return "inductor";
  }
  return null;
}

function familyLabel(key: FamilyKey): string {
  switch (key) {
    case "voltage-source":
      return "Voltage Source";
    case "current-source":
      return "Current Source";
    case "resistor":
      return "Resistor";
    case "capacitor":
      return "Capacitor";
    case "inductor":
      return "Inductor";
  }
}

function preferredForFamily(key: FamilyKey, variants: BlockMetadata[]): BlockMetadata {
  const first = variants[0];
  if (!first) {
    throw new Error(`Missing variants for family ${key}`);
  }
  const pick = (predicate: (v: BlockMetadata) => boolean) => variants.find(predicate);
  if (key === "voltage-source") {
    return (
      pick((v) => v.name === "source.voltage.dc") ??
      pick((v) => v.name === "physical_electrical.source.voltage_dc") ??
      first
    );
  }
  if (key === "current-source") {
    return (
      pick((v) => v.name === "source.current.dc") ??
      pick((v) => v.name === "physical_electrical.source.current_dc") ??
      first
    );
  }
  if (key === "resistor") {
    return (
      pick((v) => v.name === "physical_electrical.passive.resistor") ??
      pick((v) => v.name === "passive.resistor.behavioral") ??
      first
    );
  }
  if (key === "capacitor") {
    return (
      pick((v) => v.name === "physical_electrical.passive.capacitor") ??
      pick((v) => v.name === "passive.capacitor.behavioral") ??
      first
    );
  }
  return (
    pick((v) => v.name === "physical_electrical.passive.inductor") ??
    pick((v) => v.name === "passive.inductor.behavioral") ??
    first
  );
}

function dedupeAndCollapse(catalog: BlockMetadata[]): DisplayEntry[] {
  const byName = new Map<string, BlockMetadata>();
  for (const entry of catalog) {
    if (!byName.has(entry.name)) {
      byName.set(entry.name, entry);
    }
  }

  const grouped = new Map<string, BlockMetadata[]>();
  for (const entry of byName.values()) {
    const key = familyKey(entry.name);
    const groupKey = key ? `family:${key}` : `single:${entry.name}`;
    const list = grouped.get(groupKey);
    if (list) {
      list.push(entry);
    } else {
      grouped.set(groupKey, [entry]);
    }
  }

  const display: DisplayEntry[] = [];
  for (const [groupKey, variants] of grouped) {
    variants.sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name));
    if (groupKey.startsWith("single:")) {
      const entry = variants[0];
      if (entry) {
        display.push({ entry, variants: [entry] });
      }
      continue;
    }

    const key = groupKey.replace("family:", "") as FamilyKey;
    const representative = preferredForFamily(key, variants);
    const merged: BlockMetadata = {
      ...representative,
      label: familyLabel(key),
      description:
        variants.length > 1
          ? `${familyLabel(key)} (double-click to choose variant).`
          : representative.description,
    };
    display.push({ entry: merged, variants });
  }

  return display.sort((a, b) => a.entry.label.localeCompare(b.entry.label));
}

export function LibraryActivity() {
  const catalog = useLibraryStore((state) => Object.values(state.catalog));
  const activeSimulator = useLibraryStore((state) => state.activeSimulator);
  const expanded = useUiStore((state) => state.libraryTreeExpanded);
  const setExpanded = useUiStore((state) => state.setLibraryTreeExpanded);
  const recentlyUsed = useLibraryStore((state) => state.recentlyUsed);
  const [variantPicker, setVariantPicker] = useState<DisplayEntry | null>(null);

  const simulator = loadSimulatorCompat().simulators.find((entry) => entry.id === activeSimulator);
  const supported = simulator ? new Set(simulator.supported) : null;
  const rawVisibleCatalog = supported
    ? catalog.filter((entry) => supported.has(entry.name))
    : catalog;

  const visibleCatalog = useMemo(() => dedupeAndCollapse(rawVisibleCatalog), [rawVisibleCatalog]);

  return (
    <section className="library-activity">
      <header className="library-activity__header">
        <div className="library-activity__header-row">
          <strong>Block Library</strong>
          <span>{visibleCatalog.length} entries</span>
        </div>
        <div className="library-activity__header-row">
          <SimulatorSelect />
        </div>
      </header>

      {recentlyUsed.length > 0 ? (
        <section className="library-activity__recent">
          <h3>Recently used</h3>
          <div className="library-activity__chips">
            {recentlyUsed.map((name) => {
              const item = visibleCatalog.find((candidate) =>
                candidate.variants.some((variant) => variant.name === name),
              );
              if (!item) {
                return null;
              }
              return (
                <button
                  key={`${name}:${item.entry.name}`}
                  type="button"
                  className="library-chip"
                  onClick={() => {
                    insertCatalogBlock(item.entry);
                  }}
                >
                  {item.entry.label}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="library-tree" role="tree" aria-label="Block categories">
        {CATEGORY_ORDER.map((category) => {
          const entries = visibleCatalog
            .filter((item) => item.entry.category === category)
            .sort((left, right) => left.entry.label.localeCompare(right.entry.label));

          if (entries.length === 0) {
            return null;
          }

          const sectionId = `library.${category}`;
          const isExpanded = expanded[sectionId] ?? true;

          return (
            <section key={category} className="library-tree__section">
              <button
                type="button"
                className="library-tree__toggle"
                onClick={() => {
                  setExpanded(sectionId, !isExpanded);
                }}
                aria-expanded={isExpanded}
              >
                <span>{isExpanded ? "▾" : "▸"}</span>
                <span>{CATEGORY_LABELS[category]}</span>
                <span className="library-tree__count">{entries.length}</span>
              </button>
              {isExpanded ? (
                <div className="library-tree__items" role="group">
                  {entries.map((item) => (
                    <SidebarItem
                      key={item.entry.name}
                      entry={item.entry}
                      onInsert={insertCatalogBlock}
                      onOpenVariants={
                        item.variants.length > 1 ? () => setVariantPicker(item) : undefined
                      }
                    />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}

        <SignalFlowSection catalog={visibleCatalog} expanded={expanded} setExpanded={setExpanded} />
      </div>

      {variantPicker ? (
        <div className="params-backdrop" role="presentation">
          <div
            className="params-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${variantPicker.entry.label} variants`}
          >
            <header className="params-modal__header">
              <strong>{variantPicker.entry.label} variants</strong>
              <button
                type="button"
                className="params-modal__close"
                onClick={() => setVariantPicker(null)}
              >
                Close
              </button>
            </header>
            <div className="params-modal__body" style={{ display: "grid", gap: 8 }}>
              {variantPicker.variants.map((variant) => (
                <button
                  key={variant.name}
                  type="button"
                  className="library-item"
                  onClick={() => {
                    insertCatalogBlock(variant);
                    setVariantPicker(null);
                  }}
                >
                  <span className="library-item__label">
                    {variant.label}
                    <small style={{ marginLeft: 6, opacity: 0.7 }}>{variant.name}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// SignalFlowSection — nested Signal-flow groups (FE-64, FE-66)
// ---------------------------------------------------------------------------

interface SignalFlowSectionProps {
  catalog: DisplayEntry[];
  expanded: Record<string, boolean>;
  setExpanded: (id: string, value: boolean) => void;
}

function SignalFlowSection({ catalog, expanded, setExpanded }: SignalFlowSectionProps) {
  const routingEntries = catalog
    .filter((item) => {
      const meta = item.entry as BlockMetadata & { paradigm?: string };
      return meta.paradigm === "routing";
    })
    .sort((left, right) => left.entry.label.localeCompare(right.entry.label));

  const signalAttributeEntries = catalog
    .filter((item) => {
      const entry = item.entry;
      const maybeType = (entry as { type?: string }).type;
      return (
        entry.name.startsWith("signal_flow.attributes.") ||
        (typeof maybeType === "string" && maybeType.startsWith("signal-flow.attributes."))
      );
    })
    .sort((left, right) => left.entry.label.localeCompare(right.entry.label));

  const total = routingEntries.length + signalAttributeEntries.length;
  if (total === 0) return null;

  const parentId = "library.signal-flow";
  const routingId = "library.signal-flow.routing";
  const attrsId = "library.signal-flow.attributes";
  const parentExpanded = expanded[parentId] ?? true;
  const routingExpanded = expanded[routingId] ?? true;
  const attrsExpanded = expanded[attrsId] ?? true;

  return (
    <section className="library-tree__section">
      <button
        type="button"
        className="library-tree__toggle"
        onClick={() => setExpanded(parentId, !parentExpanded)}
        aria-expanded={parentExpanded}
      >
        <span>{parentExpanded ? "▾" : "▸"}</span>
        <span>Signal-flow</span>
        <span className="library-tree__count">{total}</span>
      </button>
      {parentExpanded ? (
        <div className="library-tree__items" role="group">
          {routingEntries.length > 0 ? (
            <section className="library-tree__section library-tree__section--nested">
              <button
                type="button"
                className="library-tree__toggle library-tree__toggle--sub"
                onClick={() => setExpanded(routingId, !routingExpanded)}
                aria-expanded={routingExpanded}
              >
                <span>{routingExpanded ? "▾" : "▸"}</span>
                <span>Routing</span>
                <span className="library-tree__count">{routingEntries.length}</span>
              </button>
              {routingExpanded ? (
                <div className="library-tree__items" role="group">
                  {routingEntries.map((item) => (
                    <SidebarItem
                      key={item.entry.name}
                      entry={item.entry}
                      onInsert={insertCatalogBlock}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {signalAttributeEntries.length > 0 ? (
            <section className="library-tree__section library-tree__section--nested">
              <button
                type="button"
                className="library-tree__toggle library-tree__toggle--sub"
                onClick={() => setExpanded(attrsId, !attrsExpanded)}
                aria-expanded={attrsExpanded}
              >
                <span>{attrsExpanded ? "▾" : "▸"}</span>
                <span>Signal-attributes</span>
                <span className="library-tree__count">{signalAttributeEntries.length}</span>
              </button>
              {attrsExpanded ? (
                <div className="library-tree__items" role="group">
                  {signalAttributeEntries.map((item) => (
                    <SidebarItem
                      key={item.entry.name}
                      entry={item.entry}
                      onInsert={insertCatalogBlock}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
