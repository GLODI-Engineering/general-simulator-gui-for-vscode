import type { WorkspaceVariable } from "../ipc/types";

export interface VariableListProps {
  variables: WorkspaceVariable[];
  onSelect: (name: string) => void;
}

export function VariableList({ variables, onSelect }: VariableListProps) {
  return (
    <div className="workspace-list" role="list" aria-label="Workspace variables">
      {variables.map((variable) => (
        <button
          key={variable.name}
          type="button"
          className="workspace-list__item"
          onClick={() => {
            onSelect(variable.name);
          }}
        >
          <span>{variable.name}</span>
          <span className="workspace-list__shape">
            {variable.shape.length === 0 ? "scalar" : variable.shape.join(" x ")}
          </span>
        </button>
      ))}
    </div>
  );
}

export default VariableList;
