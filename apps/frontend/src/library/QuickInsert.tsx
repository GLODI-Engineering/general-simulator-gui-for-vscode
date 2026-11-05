import { useEffect, useMemo, useRef, useState } from "react";

import type { BlockMetadata } from "../model/types";
import { useLibraryStore } from "../store";
import { insertCatalogBlock } from "./insert";
import { searchCatalog } from "./search";

export interface QuickInsertProps {
  position: { x: number; y: number };
  onInsert?: (entry: BlockMetadata) => void;
  onClose: () => void;
}

interface DisplayEntry {
  entry: BlockMetadata;
  variants: BlockMetadata[];
}

type FamilyKey = "resistor" | "capacitor" | "inductor" | "voltage-source" | "current-source";

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
      aliases: [
        ...(representative.aliases ?? []),
        ...variants.map((variant) => variant.name),
        ...variants.map((variant) => variant.label),
      ],
      description:
        variants.length > 1
          ? `${familyLabel(key)} (double-click to choose variant).`
          : representative.description,
    };
    display.push({ entry: merged, variants });
  }

  return display;
}

function collapseRecent(entries: DisplayEntry[], recent: string[]): string[] {
  const boosted = [...recent];
  for (const item of entries) {
    if (item.variants.length <= 1) {
      continue;
    }
    const idx = recent.findIndex((name) => item.variants.some((variant) => variant.name === name));
    if (idx >= 0) {
      boosted.push(item.entry.name);
    }
  }
  return boosted;
}

export function QuickInsert({ position, onInsert, onClose }: QuickInsertProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [variantPicker, setVariantPicker] = useState<DisplayEntry | null>(null);
  const catalog = useLibraryStore((state) => Object.values(state.catalog));
  const recent = useLibraryStore((state) => state.recentlyUsed);

  const collapsedCatalog = useMemo(() => dedupeAndCollapse(catalog), [catalog]);
  const collapsedRecent = useMemo(
    () => collapseRecent(collapsedCatalog, recent),
    [collapsedCatalog, recent],
  );

  const results = useMemo(
    () =>
      searchCatalog(
        collapsedCatalog.map((item) => item.entry),
        query,
        collapsedRecent,
      ).slice(0, 20),
    [collapsedCatalog, query, collapsedRecent],
  );

  const selectEntry = (entry: BlockMetadata) => {
    const collapsed = collapsedCatalog.find((item) => item.entry.name === entry.name);
    if (!collapsed) {
      onInsert?.(entry);
      insertCatalogBlock(entry);
      onClose();
      return;
    }
    if (collapsed.variants.length > 1) {
      setVariantPicker(collapsed);
      return;
    }
    const chosen = collapsed.variants[0] ?? collapsed.entry;
    onInsert?.(chosen);
    insertCatalogBlock(chosen);
    onClose();
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  return (
    <div
      className="quick-insert__backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="presentation"
    >
      <section
        className="quick-insert"
        data-testid="quick-insert"
        style={{ left: position.x, top: position.y }}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((current) => Math.max(current - 1, 0));
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const selected = results[selectedIndex]?.entry;
            if (!selected) {
              return;
            }
            selectEntry(selected);
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Quick Insert"
      >
        <input
          ref={inputRef}
          className="quick-insert__input"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
          placeholder="Search blocks"
        />
        <ul className="quick-insert__results" aria-label="Block results">
          {results.length === 0 ? <li className="quick-insert__empty">No matches.</li> : null}
          {results.map((result, index) => {
            const collapsed = collapsedCatalog.find(
              (item) => item.entry.name === result.entry.name,
            );
            const variantCount = collapsed?.variants.length ?? 1;
            return (
              <li key={result.entry.name} aria-selected={index === selectedIndex}>
                <button
                  type="button"
                  className={
                    index === selectedIndex
                      ? "quick-insert__item is-selected"
                      : "quick-insert__item"
                  }
                  onMouseEnter={() => {
                    setSelectedIndex(index);
                  }}
                  onDoubleClick={() => {
                    if (collapsed && collapsed.variants.length > 1) {
                      setVariantPicker(collapsed);
                    }
                  }}
                  onClick={() => {
                    selectEntry(result.entry);
                  }}
                >
                  <span className="quick-insert__item-label">{result.entry.label}</span>
                  <span className="quick-insert__item-meta">
                    {result.entry.name}
                    {variantCount > 1 ? ` · ${variantCount} variants` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {variantPicker ? (
          <div className="quick-insert__variants" style={{ marginTop: 8 }}>
            <div className="quick-insert__empty">Choose {variantPicker.entry.label} variant</div>
            <ul
              className="quick-insert__results"
              aria-label={`${variantPicker.entry.label} variants`}
            >
              {variantPicker.variants.map((variant) => (
                <li key={variant.name}>
                  <button
                    type="button"
                    className="quick-insert__item"
                    onClick={() => {
                      onInsert?.(variant);
                      insertCatalogBlock(variant);
                      onClose();
                    }}
                  >
                    <span className="quick-insert__item-label">{variant.label}</span>
                    <span className="quick-insert__item-meta">{variant.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default QuickInsert;
