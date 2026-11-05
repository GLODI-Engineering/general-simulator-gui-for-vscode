import { resolveBlockMetadata } from "../canvas/subckt-metadata";
import { listTiers } from "../library/catalog-core";
import { canSwap } from "../library/fidelity-swap";
import type { BlockMetadata, ParamValue } from "../model/types";
import { useGraphStore, useLibraryStore, useToastStore, useUiStore } from "../store";
import { resolveModelParams } from "../store/model";
import { FidelitySwap } from "./FidelitySwap";
import { ParamExpressionInput } from "./ParamExpressionInput";
import { Dropdown } from "./editors/Dropdown";
import { StringInput } from "./editors/StringInput";
import { VectorInput } from "./editors/VectorInput";

function commitParam(blockIds: string[], key: string, value: ParamValue) {
  const graph = useGraphStore.getState();
  graph.transact(`set ${key}`, () => {
    for (const blockId of blockIds) {
      graph.setParam(blockId, key, value);
    }
  });
}

function renderEditor(
  blockIds: string[],
  metadata: BlockMetadata,
  name: string,
  value: ParamValue | undefined,
  resolvedParams: Record<string, number>,
) {
  const param = metadata.params.find((entry) => entry.name === name);
  if (!param) {
    return null;
  }

  switch (param.type) {
    case "number":
    case "integer": {
      const exprValue =
        typeof value === "number" || typeof value === "string"
          ? (value as string | number)
          : undefined;
      return (
        <div key={param.name} className="inspector-field" data-param-name={param.name}>
          <span>{param.label}</span>
          <ParamExpressionInput
            value={exprValue}
            params={resolvedParams}
            onChange={(next) => {
              const committed: ParamValue =
                typeof next === "number" && param.type === "integer" ? Math.round(next) : next;
              commitParam(blockIds, param.name, committed);
            }}
          />
        </div>
      );
    }
    case "vector":
      return (
        <div key={param.name} data-param-name={param.name}>
          <VectorInput
            label={param.label}
            value={Array.isArray(value) ? (value as number[]) : undefined}
            onCommit={(next) => commitParam(blockIds, param.name, next)}
          />
        </div>
      );
    case "enum":
      return (
        <div key={param.name} data-param-name={param.name}>
          <Dropdown
            label={param.label}
            value={typeof value === "string" ? value : undefined}
            choices={param.choices ?? []}
            onCommit={(next) => commitParam(blockIds, param.name, next)}
          />
        </div>
      );
    case "bool":
      return (
        <div key={param.name} data-param-name={param.name}>
          <Dropdown
            label={param.label}
            value={typeof value === "boolean" ? String(value) : undefined}
            choices={["true", "false"]}
            onCommit={(next) => commitParam(blockIds, param.name, next === "true")}
          />
        </div>
      );
    default:
      return (
        <div key={param.name} data-param-name={param.name}>
          <StringInput
            label={param.label}
            value={typeof value === "string" ? value : undefined}
            onCommit={(next) => commitParam(blockIds, param.name, next)}
          />
        </div>
      );
  }
}

export function Inspector() {
  const selection = useUiStore((state) => [...state.selection]);
  const blocks = useGraphStore((state) => state.document.model.blocks);
  const grid = useGraphStore((state) => state.document.model.grid);
  const modelParams = useGraphStore((state) => state.document.model.params);
  const catalog = useLibraryStore((state) => state.catalog);
  const subcktDefs = useGraphStore((state) => state.document.model.subckt_defs);

  const resolvedParams = resolveModelParams(modelParams);
  const selectedBlocks = blocks.filter((block) => selection.includes(block.id));

  if (selectedBlocks.length === 0) {
    return (
      <section className="inspector-panel">
        <header className="inspector-panel__header">Property Inspector</header>
        <div className="inspector-panel__empty">
          <p>No block selected.</p>
          <p>Grid spacing: {grid}</p>
        </div>
      </section>
    );
  }

  if (selectedBlocks.length > 1) {
    const [firstBlock] = selectedBlocks;
    if (!firstBlock) {
      return null;
    }

    const sharedNames = selectedBlocks
      .map((block) => new Set(Object.keys(block.params)))
      .reduce<string[]>((shared, current, index) => {
        const keys = [...current];
        if (index === 0) {
          return keys;
        }
        return shared.filter((key) => current.has(key));
      }, []);

    const firstMetadata = resolveBlockMetadata(firstBlock, catalog, subcktDefs);
    const blockIds = selectedBlocks.map((candidate) => candidate.id);

    return (
      <section className="inspector-panel">
        <header className="inspector-panel__header">{selectedBlocks.length} blocks selected</header>
        <div className="inspector-panel__body">
          {sharedNames.length === 0 || !firstMetadata ? <p>No shared editable params.</p> : null}
          {firstMetadata
            ? sharedNames.map((name) =>
                renderEditor(
                  blockIds,
                  firstMetadata,
                  name,
                  firstBlock.params[name],
                  resolvedParams,
                ),
              )
            : null}
        </div>
      </section>
    );
  }

  const block = selectedBlocks[0];
  if (!block) {
    return null;
  }
  const metadata = resolveBlockMetadata(block, catalog, subcktDefs);
  const tiers = listTiers(block.type);
  const pushToast = useToastStore.getState().pushToast;

  return (
    <section className="inspector-panel">
      <header className="inspector-panel__header">
        <strong>{metadata?.label ?? block.type}</strong>
        <span>{block.id}</span>
      </header>
      <div className="inspector-panel__body">
        <FidelitySwap
          blockId={block.id}
          currentFidelity={block.fidelity}
          tiers={tiers}
          onSwap={(newFidelity) => {
            if (newFidelity === block.fidelity) {
              return;
            }
            const graph = useGraphStore.getState();
            const preflight = canSwap(block.id, newFidelity, graph.document.model);
            if (!preflight.ok) {
              if (preflight.reason === "port-shape-mismatch") {
                const port = preflight.port ?? "<unknown>";
                if (preflight.wasKind && preflight.wouldKind) {
                  pushToast(
                    `Cannot swap: port ${port} kind mismatch (was ${preflight.wasKind}, would be ${preflight.wouldKind})`,
                  );
                } else {
                  pushToast(`Cannot swap: port ${port} kind mismatch`);
                }
              }
              return;
            }

            graph.transact("swap fidelity", () => {
              const result = graph.swapFidelity(block.id, newFidelity);
              if (result.ok) {
                for (const wireId of result.removedWires) {
                  pushToast(`Removed wire ${wireId} (port no longer present)`);
                }
              }
            });
          }}
        />

        {metadata ? (
          metadata.params.map((param) =>
            renderEditor(
              [block.id],
              metadata,
              param.name,
              block.params[param.name],
              resolvedParams,
            ),
          )
        ) : (
          <p>Metadata unavailable for this block.</p>
        )}
      </div>
    </section>
  );
}

export default Inspector;
