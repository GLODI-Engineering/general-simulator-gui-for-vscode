import { useState } from "react";
import type { ParamEntry } from "../model/types";
import { ParamRowEditor } from "./ParamRowEditor";

export interface ParamTableEntry {
  name: string;
  value: string | number;
  unit?: string;
  doc?: string;
}

interface Props {
  params?: ParamTableEntry[];
  onChange?: (params: ParamTableEntry[]) => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function isIdentifier(v: string | number | undefined): v is string {
  return typeof v === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(v);
}

function buildDepsMap(rows: ParamTableEntry[]): Record<string, string | null> {
  const deps: Record<string, string | null> = {};
  for (const row of rows) {
    deps[row.name] = isIdentifier(row.value) ? row.value : null;
  }
  return deps;
}

function findCycle(deps: Record<string, string | null>, startName: string): string[] | null {
  const path: string[] = [startName];
  const seen = new Set<string>([startName]);

  let current = deps[startName];
  while (current !== null && current !== undefined) {
    if (current === startName) {
      path.push(current);
      return path;
    }
    if (seen.has(current)) {
      return null;
    }
    seen.add(current);
    path.push(current);
    current = deps[current] ?? null;
  }
  return null;
}

function checkCycle(
  rows: ParamTableEntry[],
  name: string,
  newValue: string | number,
): string | null {
  const simulated = rows.map((r) => (r.name === name ? { ...r, value: newValue } : r));
  const deps = buildDepsMap(simulated);
  const cycle = findCycle(deps, name);
  return cycle ? `Param cycle: ${cycle.join(" -> ")}` : null;
}

function buildResolvedParams(rows: ParamTableEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    if (typeof row.value === "number") {
      result[row.name] = row.value;
    }
  }
  return result;
}

// ── row state ─────────────────────────────────────────────────────────────────

interface CommittedRow {
  kind: "committed";
  entry: ParamTableEntry;
  nameError: string | null;
  valueError: string | null;
}

interface PendingRow {
  kind: "pending";
  draftName: string;
  nameError: string | null;
}

type RowState = CommittedRow | PendingRow;

// ── component ─────────────────────────────────────────────────────────────────

export function ParamTable({ params = [], onChange }: Props) {
  const [rows, setRows] = useState<RowState[]>(() =>
    params.map(
      (p): CommittedRow => ({
        kind: "committed",
        entry: { ...p },
        nameError: null,
        valueError: null,
      }),
    ),
  );

  const committedRows = rows.filter((r): r is CommittedRow => r.kind === "committed");
  const resolvedParams = buildResolvedParams(committedRows.map((r) => r.entry));

  function emitChange(committed: CommittedRow[]) {
    onChange?.(committed.map((r) => ({ ...r.entry })));
  }

  // ── add ────────────────────────────────────────────────────────────────────

  function addRow() {
    // Only one pending row at a time
    if (rows.some((r) => r.kind === "pending")) return;
    setRows((prev) => [...prev, { kind: "pending", draftName: "", nameError: null }]);
  }

  // ── commit pending name ────────────────────────────────────────────────────

  function commitPendingName(name: string) {
    if (name.trim().length === 0) {
      // discard empty
      setRows((prev) => prev.filter((r) => r.kind !== "pending"));
      return;
    }

    const committed = rows.filter((r): r is CommittedRow => r.kind === "committed");

    if (committed.some((r) => r.entry.name === name)) {
      setRows((prev) =>
        prev.map((r) =>
          r.kind === "pending" ? { ...r, draftName: name, nameError: "Name already in use" } : r,
        ),
      );
      return;
    }

    const newEntry: ParamTableEntry = { name, value: 0, unit: "", doc: "" };
    const newRow: CommittedRow = {
      kind: "committed",
      entry: newEntry,
      nameError: null,
      valueError: null,
    };
    const next: RowState[] = [...rows.filter((r) => r.kind !== "pending"), newRow];
    setRows(next);
    emitChange(next.filter((r): r is CommittedRow => r.kind === "committed"));
  }

  function cancelPending() {
    setRows((prev) => prev.filter((r) => r.kind !== "pending"));
  }

  // ── delete ────────────────────────────────────────────────────────────────

  function deleteRow(index: number) {
    const committed = rows.filter((r): r is CommittedRow => r.kind === "committed");
    const next = committed.filter((_, i) => i !== index);
    const nextFull: RowState[] = [...next, ...rows.filter((r) => r.kind === "pending")];
    setRows(nextFull);
    emitChange(next);
  }

  // ── edit committed fields ─────────────────────────────────────────────────

  function commitValue(index: number, value: string | number) {
    const committed = rows.filter((r): r is CommittedRow => r.kind === "committed");
    const row = committed[index];
    if (!row) return;

    const cycleError = checkCycle(
      committed.map((r) => r.entry),
      row.entry.name,
      value,
    );
    if (cycleError) {
      setRows((prev) => {
        const cIdx = prev.findIndex(
          (r): r is CommittedRow => r.kind === "committed" && r.entry.name === row.entry.name,
        );
        if (cIdx === -1) return prev;
        const next = [...prev];
        next[cIdx] = {
          ...(next[cIdx] as CommittedRow),
          entry: { ...(next[cIdx] as CommittedRow).entry, value },
          valueError: cycleError,
        };
        return next;
      });
      return;
    }

    setRows((prev) => {
      let committedCount = 0;
      return prev.map((r) => {
        if (r.kind !== "committed") return r;
        const current = committedCount;
        committedCount++;
        if (current !== index) return r;
        return { ...r, entry: { ...r.entry, value }, valueError: null };
      });
    });

    const nextCommitted = committed.map((r, i) =>
      i === index ? { ...r, entry: { ...r.entry, value } } : r,
    );
    emitChange(nextCommitted);
  }

  function commitUnit(index: number, unit: string) {
    const committed = rows.filter((r): r is CommittedRow => r.kind === "committed");
    const nextCommitted = committed.map((r, i) =>
      i === index ? { ...r, entry: { ...r.entry, unit } } : r,
    );
    setRows((prev) => {
      let committedCount = 0;
      return prev.map((r) => {
        if (r.kind !== "committed") return r;
        const current = committedCount;
        committedCount++;
        if (current !== index) return r;
        return { ...r, entry: { ...r.entry, unit } };
      });
    });
    emitChange(nextCommitted);
  }

  function commitDoc(index: number, doc: string) {
    const committed = rows.filter((r): r is CommittedRow => r.kind === "committed");
    const nextCommitted = committed.map((r, i) =>
      i === index ? { ...r, entry: { ...r.entry, doc } } : r,
    );
    setRows((prev) => {
      let committedCount = 0;
      return prev.map((r) => {
        if (r.kind !== "committed") return r;
        const current = committedCount;
        committedCount++;
        if (current !== index) return r;
        return { ...r, entry: { ...r.entry, doc } };
      });
    });
    emitChange(nextCommitted);
  }

  // ── render ────────────────────────────────────────────────────────────────

  let committedIndex = -1;

  return (
    <div className="param-table">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
            <th>Unit</th>
            <th>Description</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            if (row.kind === "committed") {
              committedIndex++;
              const ci = committedIndex;
              return (
                <ParamRowEditor
                  // biome-ignore lint/suspicious/noArrayIndexKey: row order stable
                  key={rowIdx}
                  entry={row.entry as ParamEntry}
                  resolvedParams={resolvedParams}
                  nameError={row.nameError}
                  valueError={row.valueError}
                  onCommitName={() => {
                    /* committed rows: name editing not supported inline */
                  }}
                  onCommitValue={(v) => commitValue(ci, v)}
                  onCommitUnit={(u) => commitUnit(ci, u)}
                  onCommitDoc={(d) => commitDoc(ci, d)}
                  onDelete={() => deleteRow(ci)}
                />
              );
            }

            // pending row: only a name input
            return (
              <tr key="pending" className="param-row param-row--pending">
                <td colSpan={4}>
                  <input
                    type="text"
                    className="param-row__pending-name"
                    placeholder="param name"
                    value={row.draftName}
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      setRows((prev) =>
                        prev.map((r) =>
                          r.kind === "pending" ? { ...r, draftName: val, nameError: null } : r,
                        ),
                      );
                    }}
                    onBlur={(e) => commitPendingName(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        commitPendingName((e.currentTarget as HTMLInputElement).value);
                      if (e.key === "Escape") cancelPending();
                    }}
                  />
                  {row.nameError ? <span className="param-row__error">{row.nameError}</span> : null}
                </td>
                <td>
                  <button type="button" aria-label="Cancel add param" onClick={cancelPending}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="param-table__add-btn" aria-label="Add row" onClick={addRow}>
        + Add row
      </button>
    </div>
  );
}

export default ParamTable;
