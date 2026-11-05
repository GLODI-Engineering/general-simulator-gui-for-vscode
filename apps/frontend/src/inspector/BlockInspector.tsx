/**
 * BlockInspector
 *
 * Renders a single block's editable parameters. Numeric (number/integer) fields
 * use ParamExpressionInput so users can type plain numbers, param identifiers,
 * or `{...}` expression strings.
 */
import type { BlockMetadata, ParamValue } from "../model/types";
import { useGraphStore } from "../store";
import { resolveModelParams } from "../store/model";
import { ParamExpressionInput } from "./ParamExpressionInput";
import { Dropdown } from "./editors/Dropdown";
import { StringInput } from "./editors/StringInput";
import { VectorInput } from "./editors/VectorInput";

interface Props {
  blockId: string;
  blockType: string;
  params: Record<string, ParamValue>;
  metadata: BlockMetadata;
}

function commitParam(blockId: string, key: string, value: ParamValue) {
  const graph = useGraphStore.getState();
  graph.transact(`set ${key}`, () => {
    graph.setParam(blockId, key, value);
  });
}

export function BlockInspector({ blockId, params, metadata }: Props) {
  const modelParams = useGraphStore((state) => state.document.model.params);
  const resolvedParams = resolveModelParams(modelParams);

  return (
    <>
      {metadata.params.map((param) => {
        const value = params[param.name];

        switch (param.type) {
          case "number":
          case "integer": {
            const exprValue =
              typeof value === "number" || typeof value === "string"
                ? (value as string | number)
                : undefined;
            return (
              <div key={param.name} className="inspector-field">
                <span>{param.label}</span>
                <ParamExpressionInput
                  value={exprValue}
                  params={resolvedParams}
                  onChange={(next) => {
                    const committed: ParamValue =
                      typeof next === "number" && param.type === "integer"
                        ? Math.round(next)
                        : next;
                    commitParam(blockId, param.name, committed);
                  }}
                />
              </div>
            );
          }

          case "vector":
            return (
              <VectorInput
                key={param.name}
                label={param.label}
                value={Array.isArray(value) ? (value as number[]) : undefined}
                onCommit={(next) => commitParam(blockId, param.name, next)}
              />
            );

          case "enum":
            return (
              <Dropdown
                key={param.name}
                label={param.label}
                value={typeof value === "string" ? value : undefined}
                choices={param.choices ?? []}
                onCommit={(next) => commitParam(blockId, param.name, next)}
              />
            );

          case "bool":
            return (
              <Dropdown
                key={param.name}
                label={param.label}
                value={typeof value === "boolean" ? String(value) : undefined}
                choices={["true", "false"]}
                onCommit={(next) => commitParam(blockId, param.name, next === "true")}
              />
            );

          default:
            return (
              <StringInput
                key={param.name}
                label={param.label}
                value={typeof value === "string" ? value : undefined}
                onCommit={(next) => commitParam(blockId, param.name, next)}
              />
            );
        }
      })}
    </>
  );
}

export default BlockInspector;
