import { useMemo, useState } from "react";

import type { DcOpEntry } from "../ipc/types";
import { useIpcStore } from "../store";

type SortColumn = "node_or_branch" | "quantity" | "value" | "unit";
type SortDir = "asc" | "desc";

interface SortState {
  col: SortColumn;
  dir: SortDir;
}

function compareEntries(a: DcOpEntry, b: DcOpEntry, sort: SortState): number {
  const { col, dir } = sort;
  let cmp: number;
  if (col === "value") {
    cmp = a.value - b.value;
  } else {
    cmp = a[col].localeCompare(b[col]);
  }
  return dir === "asc" ? cmp : -cmp;
}

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "node_or_branch", label: "Node / Branch" },
  { key: "quantity", label: "Quantity" },
  { key: "value", label: "Value" },
  { key: "unit", label: "Unit" },
];

export function DcOpTable() {
  const dcOpTable = useIpcStore((state) => state.dcOpTable);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortState>({ col: "node_or_branch", dir: "asc" });

  const rows = useMemo(() => {
    if (!dcOpTable) return [];
    const lower = filter.toLowerCase();
    const filtered = lower
      ? dcOpTable.filter((entry) => entry.node_or_branch.toLowerCase().includes(lower))
      : dcOpTable;
    return [...filtered].sort((a, b) => compareEntries(a, b, sort));
  }, [dcOpTable, filter, sort]);

  function handleHeaderClick(col: SortColumn) {
    setSort((prev) =>
      prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" },
    );
  }

  function sortIndicator(col: SortColumn): string {
    if (sort.col !== col) return "";
    return sort.dir === "asc" ? " ▲" : " ▼";
  }

  if (!dcOpTable) {
    return (
      <div className="dc-op-table dc-op-table--empty">No DC operating-point results available.</div>
    );
  }

  return (
    <div className="dc-op-table">
      <div className="dc-op-table__toolbar">
        <input
          className="dc-op-table__search"
          type="search"
          placeholder="Filter by node / branch…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filter DC operating-point rows by node or branch"
        />
        <span className="dc-op-table__count">{rows.length} rows</span>
      </div>
      <div className="dc-op-table__scroll">
        <table className="dc-op-table__table" aria-label="DC operating-point results">
          <thead>
            <tr>
              {COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  className="dc-op-table__th"
                  aria-sort={
                    sort.col === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  <button
                    type="button"
                    className="dc-op-table__sort-btn"
                    onClick={() => handleHeaderClick(key)}
                  >
                    {label}
                    {sortIndicator(key)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((entry, idx) => (
              <tr
                key={`${entry.node_or_branch}-${entry.quantity}-${idx}`}
                className="dc-op-table__row"
              >
                <td className="dc-op-table__td">{entry.node_or_branch}</td>
                <td className="dc-op-table__td">{entry.quantity}</td>
                <td className="dc-op-table__td dc-op-table__td--numeric">{entry.value}</td>
                <td className="dc-op-table__td">{entry.unit}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="dc-op-table__td dc-op-table__td--empty" colSpan={4}>
                  No rows match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DcOpTable;
