import { type CSSProperties, useEffect, useState } from "react";

import { getIpcClient } from "../ipc/transport";
import type { WorkspaceVariable } from "../ipc/types";
import { useIpcStore } from "../store";
import { Console } from "./Console";
import { VariableList } from "./VariableList";
import { VariableValue } from "./VariableValue";

const WORKSPACE_SPLIT_KEY = "gensim.workspace.split.vscode.v1";

export function WorkspaceTab() {
  const variables = useIpcStore((state) => state.workspaceVariables);
  const setWorkspaceVariables = useIpcStore((state) => state.setWorkspaceVariables);
  const output = useIpcStore((state) => state.output);
  const [selected, setSelected] = useState<WorkspaceVariable | null>(null);
  const [split, setSplit] = useState<number>(() => {
    const raw = globalThis.localStorage?.getItem(WORKSPACE_SPLIT_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 20 && parsed <= 60 ? parsed : 32;
  });

  useEffect(() => {
    const ipc = getIpcClient();
    return ipc.subscribe("workspace_update", (payload) => {
      setWorkspaceVariables(payload as WorkspaceVariable[]);
    });
  }, [setWorkspaceVariables]);

  useEffect(() => {
    globalThis.localStorage?.setItem(WORKSPACE_SPLIT_KEY, String(split));
  }, [split]);

  return (
    <section
      className="workspace-tab"
      style={{ "--workspace-split": `${split}%` } as CSSProperties}
    >
      <div className="workspace-tab__list">
        <VariableList
          variables={variables}
          onSelect={(name) => {
            void getIpcClient()
              .workspaceGet(name)
              .then((value) => {
                setSelected(value);
              });
          }}
        />
      </div>
      <input
        className="workspace-tab__split"
        type="range"
        min={20}
        max={60}
        value={split}
        onChange={(event) => setSplit(Number(event.currentTarget.value))}
        aria-label="Resize workspace split"
      />
      <div className="workspace-tab__value">
        <VariableValue variable={selected} />
        <Console lines={output} />
      </div>
    </section>
  );
}

export default WorkspaceTab;
