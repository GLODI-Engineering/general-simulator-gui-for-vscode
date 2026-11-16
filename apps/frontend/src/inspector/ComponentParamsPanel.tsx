import { useEffect, useMemo, useState } from "react";
import { resolveBlockMetadata } from "../canvas/subckt-metadata";
import { blockDomainOf } from "../library/block-domain";
import { supportsBlock } from "../library/simulator-compat";
import type { Block, BlockMetadata, ParamValue } from "../model/types";
import { paramValueFrom } from "../netlist/spice-number";
import { useGraphStore, useLibraryStore, useUiStore } from "../store";

/**
 * One editable row. The engine's catalogue is the only source of parameters
 * now: it declares each component's params with their defaults, so there is
 * nothing left to describe them twice.
 */
interface ParamRowSpec {
  name: string;
  label: string;
  defaultValue: number | string;
  description: string;
  unit?: string;
}

interface Props {
  blockId: string;
  onClose: () => void;
}

type FamilyKey = "resistor" | "capacitor" | "inductor" | "voltage-source" | "current-source";

function familyKey(type: string): FamilyKey | null {
  if (
    type.startsWith("source.voltage.") ||
    type.startsWith("physical_electrical.source.voltage_")
  ) {
    return "voltage-source";
  }
  if (
    type.startsWith("source.current.") ||
    type.startsWith("physical_electrical.source.current_")
  ) {
    return "current-source";
  }
  if (type.startsWith("passive.resistor.") || type === "physical_electrical.passive.resistor") {
    return "resistor";
  }
  if (type.startsWith("passive.capacitor.") || type === "physical_electrical.passive.capacitor") {
    return "capacitor";
  }
  if (type.startsWith("passive.inductor.") || type === "physical_electrical.passive.inductor") {
    return "inductor";
  }
  return null;
}

function inferParadigm(type: string): Block["paradigm"] {
  if (type.startsWith("signal-flow.")) return "signal-flow";
  if (type.startsWith("physical-")) return "physical-network";
  if (type.startsWith("converter.")) return "converter";
  if (type.startsWith("hierarchy.")) return "hierarchy";
  if (type.startsWith("routing.")) return "routing";
  if (type.startsWith("annotation.")) return "annotation";
  return "signal-flow";
}

function defaultParams(metadata: BlockMetadata): Record<string, ParamValue> {
  return Object.fromEntries(
    metadata.params.map((param) => [
      param.name,
      structuredClone((param.default ?? "") as ParamValue),
    ]),
  );
}

function paramValueToString(value: ParamValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "number" || typeof value === "string") return String(value);
  return "";
}

/**
 * Turn what was typed into what gets stored.
 *
 * `Number()` used to do this, which answers NaN for every engineering
 * suffix, so `10u` fell through to being stored as the *string* "10u" while
 * `2200` was stored as a number. Same field, two types, depending only on
 * whether the value had a suffix. The netlist happened to work — it emits
 * strings verbatim and the solver parses them — but nothing in the frontend
 * could compute with, range-check or display such a value.
 *
 * A string is still kept when the text is not a number at all, because that
 * is a legitimate SPICE parameter reference or expression (`{Rload}`), and
 * flattening those would break a real feature to fix a different one.
 */
function parseCommit(raw: string, fallback: number | string): ParamValue | null {
  if (raw.trim() === "") return fallback;
  return paramValueFrom(raw);
}

function ParamRow({
  param,
  value,
  onCommit,
}: {
  param: ParamRowSpec;
  value: string;
  onCommit: (next: ParamValue) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Resync the local draft when the committed value changes underneath us —
  // e.g. switching model level reuses this same-named row instance, and a
  // commit normalizes the stored value. Without this the input keeps a stale
  // draft from the previous value/level.
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <label className="params-modal__row" title={param.description}>
      <span className="params-modal__row-label">
        {param.label}
        {param.unit ? <em>{param.unit}</em> : null}
      </span>
      <input
        type="text"
        className="params-modal__input"
        value={draft}
        placeholder={String(param.defaultValue)}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => {
          const next = parseCommit(draft, param.defaultValue);
          // null means "a number with a suffix the solver cannot read" —
          // leave the stored value alone rather than saving something a run
          // will choke on later.
          if (next !== null) onCommit(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const next = parseCommit(draft, param.defaultValue);
            if (next !== null) onCommit(next);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
      <span className="params-modal__row-desc">{param.description}</span>
    </label>
  );
}

export function ComponentParamsPanel({ blockId, onClose }: Props) {
  const hierarchyPath = useUiStore((state) => state.hierarchyPath);
  const document = useGraphStore((state) => state.document);
  const activeModel = useMemo(() => {
    let model = document.model;
    for (const step of hierarchyPath) {
      const block = model.blocks.find((candidate) => candidate.id === step);
      if (!block?.subsystem) {
        break;
      }
      model = block.subsystem;
    }
    return model;
  }, [document.model, hierarchyPath]);
  const block = activeModel.blocks.find((b) => b.id === blockId);
  const catalog = useLibraryStore((state) => state.catalog);
  const metadata = block
    ? (resolveBlockMetadata(block, catalog, activeModel.subckt_defs) ?? undefined)
    : undefined;

  const activeSimulator = useLibraryStore((state) => state.activeSimulator);

  const unsupported = block ? !supportsBlock(activeSimulator, block.type) : false;

  const variantFamily = block ? familyKey(block.type) : null;
  const variants = useMemo(() => {
    if (!variantFamily) {
      return [] as BlockMetadata[];
    }
    const byName = new Map<string, BlockMetadata>();
    for (const entry of Object.values(catalog)) {
      if (familyKey(entry.name) === variantFamily && !byName.has(entry.name)) {
        byName.set(entry.name, entry);
      }
    }
    return [...byName.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [catalog, variantFamily]);

  if (!block || !metadata) {
    return null;
  }

  const commitParam = (name: string, value: ParamValue) => {
    const graph = useGraphStore.getState();
    graph.transact(`set ${name}`, () => {
      graph.setParam(blockId, name, value);
    });
  };

  const commitVariant = (nextType: string) => {
    if (nextType === block.type) {
      return;
    }
    const nextMeta = catalog[nextType];
    if (!nextMeta) {
      return;
    }
    const graph = useGraphStore.getState();
    graph.transact("set variant", () => {
      graph.mutateModelAtPath(hierarchyPath, (model) => {
        model.blocks = model.blocks.map((candidate) => {
          if (candidate.id !== blockId) {
            return candidate;
          }
          const defaults = defaultParams(nextMeta);
          const mergedParams: Record<string, ParamValue> = { ...defaults };
          for (const key of Object.keys(defaults)) {
            if (key in candidate.params) {
              mergedParams[key] = candidate.params[key] as ParamValue;
            }
          }
          return {
            ...candidate,
            type: nextMeta.name,
            paradigm: inferParadigm(nextMeta.name),
            domain: blockDomainOf(nextMeta),
            params: mergedParams,
          };
        });
      });
    });
  };

  return (
    <div className="params-modal-backdrop" onMouseDown={onClose} aria-label="Component parameters">
      <div
        className="params-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Component parameters: ${metadata.label}`}
        data-testid="component-params-modal"
      >
        <header className="params-modal__header">
          <div>
            <strong>{metadata.label}</strong>
            <span className="params-modal__id">{block.id}</span>
          </div>
          <button
            type="button"
            className="params-modal__close"
            onClick={onClose}
            aria-label="Close component parameters"
          >
            ✕
          </button>
        </header>

        <div className="params-modal__body">
          {/* Variant selector for collapsed families (R/L/C and sources) */}
          {variants.length > 1 ? (
            <section className="params-modal__section">
              <label className="params-modal__row params-modal__row--level">
                <span className="params-modal__row-label">Variant</span>
                <select
                  className="params-modal__input"
                  value={block.type}
                  onChange={(event) => commitVariant(event.currentTarget.value)}
                >
                  {variants.map((variant) => (
                    <option key={variant.name} value={variant.name}>
                      {variant.label} ({variant.name})
                    </option>
                  ))}
                </select>
              </label>
            </section>
          ) : null}

          {/* What this simulator will and will not honour. Said plainly,
              because the alternative is a panel that quietly offers less
              than it did yesterday with no reason given. */}
          {unsupported ? (
            <p className="params-modal__contract params-modal__contract--error" role="alert">
              This component is not supported by the active simulator. It can be placed and saved,
              but a run will not compile it.
            </p>
          ) : null}

          {/* Catalog instance params (for non-device blocks like signal/control) */}
          {metadata.params.length > 0 ? (
            <section className="params-modal__section">
              <h3 className="params-modal__group-label">Instance parameters</h3>
              <div className="params-modal__grid">
                {metadata.params.map((param) => (
                  <ParamRow
                    key={param.name}
                    param={{
                      name: param.name,
                      label: param.label,
                      defaultValue: (param.default ?? "") as number | string,
                      description: param.description ?? "",
                    }}
                    value={paramValueToString(block.params[param.name])}
                    onCommit={(next) => commitParam(param.name, next)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="params-modal__footer">
          <button type="button" className="params-modal__done" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

export default ComponentParamsPanel;
