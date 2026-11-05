import { useIpcStore } from "../store";

/**
 * Read-only viewer for the raw SPICE netlist behind the current run —
 * whether generated from the schematic or imported via File > Import SPICE
 * netlist… . Distinct from the Output tab (which interleaves the netlist
 * with run logs): this always shows just the netlist text, nothing else.
 */
export function NetlistTab() {
  const lastNetlist = useIpcStore((state) => state.lastNetlist);
  const importedNetlist = useIpcStore((state) => state.importedNetlist);
  const setImportedNetlist = useIpcStore((state) => state.setImportedNetlist);

  const text = importedNetlist ?? lastNetlist;

  if (!text) {
    return (
      <div
        className="netlist-tab netlist-tab--empty"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#64748b",
          fontSize: "0.9rem",
        }}
      >
        No netlist yet — run a simulation or import one via File &gt; Import SPICE netlist…
      </div>
    );
  }

  return (
    <div
      className="netlist-tab"
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
    >
      <div
        className="netlist-tab__toolbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: "1px solid #e2e8f0",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
          {importedNetlist
            ? "Imported netlist (overrides schematic generation on Run)"
            : "Netlist generated from the current schematic"}
        </span>
        {importedNetlist && (
          <button
            type="button"
            onClick={() => setImportedNetlist(null)}
            style={{
              fontSize: "0.75rem",
              padding: "2px 8px",
              border: "1px solid #cbd5e1",
              borderRadius: "4px",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Clear imported netlist
          </button>
        )}
      </div>
      <pre
        className="netlist-tab__body"
        data-testid="netlist-tab-body"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          margin: 0,
          padding: "10px 14px",
          fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
          fontSize: "0.8rem",
          lineHeight: 1.5,
          whiteSpace: "pre",
          background: "#ffffff",
        }}
      >
        {text}
      </pre>
    </div>
  );
}

export default NetlistTab;
