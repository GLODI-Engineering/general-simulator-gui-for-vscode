export interface ConsoleProps {
  lines: string[];
}

export function Console({ lines }: ConsoleProps) {
  return (
    <div className="workspace-console" aria-label="Workspace console">
      {lines.length === 0 ? (
        <div className="workspace-console__empty">Run code to see output.</div>
      ) : null}
      {lines.map((line, index) => (
        <pre key={`${index}:${line}`} className="workspace-console__line">
          {line}
        </pre>
      ))}
    </div>
  );
}

export default Console;
