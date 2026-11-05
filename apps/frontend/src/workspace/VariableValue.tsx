import type { WorkspaceVariable } from "../ipc/types";

export function VariableValue({ variable }: { variable: WorkspaceVariable | null }) {
  if (!variable) {
    return (
      <div className="workspace-value workspace-value--empty">Select a variable to inspect it.</div>
    );
  }

  return (
    <div className="workspace-value">
      <strong>{variable.name}</strong>
      <pre className="workspace-value__preview">{JSON.stringify(variable.value, null, 2)}</pre>
    </div>
  );
}

export default VariableValue;
