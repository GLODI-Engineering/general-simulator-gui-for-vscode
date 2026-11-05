import { useRef, useState } from "react";

import { useWaveformStore } from "../store/waveform";

// Stable colour palette for group badges — matches the signal colour palette
// length so badges stay visually consistent across the UI.
const _GROUP_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#a855f7",
];

function _groupColor(index: number): string {
  return _GROUP_COLORS[index % _GROUP_COLORS.length] ?? "#3b82f6";
}

export function CouplingGroupsPanel() {
  const couplingGroups = useWaveformStore((s) => s.couplingGroups);
  const axes = useWaveformStore((s) => s.axes);
  const createCouplingGroup = useWaveformStore((s) => s.createCouplingGroup);
  const assignAxesToGroup = useWaveformStore((s) => s.assignAxesToGroup);
  const deleteCouplingGroup = useWaveformStore((s) => s.deleteCouplingGroup);

  const [newGroupName, setNewGroupName] = useState("");
  const [newLockX, setNewLockX] = useState(true);
  const [newLockY, setNewLockY] = useState(false);

  // Track which axes badge is being dragged: { axesId, groupId | null }
  const dragSource = useRef<{ axesId: string } | null>(null);

  function handleCreateGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    createCouplingGroup(name, newLockX, newLockY);
    setNewGroupName("");
  }

  function handleDragStart(axesId: string) {
    dragSource.current = { axesId };
  }

  function handleDropOnGroup(groupId: string) {
    if (!dragSource.current) return;
    assignAxesToGroup(dragSource.current.axesId, groupId);
    dragSource.current = null;
  }

  const groupEntries = [...couplingGroups.entries()];

  return (
    <div className="coupling-groups-panel" style={{ padding: "8px", fontSize: "0.8125rem" }}>
      <div
        className="coupling-groups-panel__title"
        style={{ fontWeight: 600, marginBottom: "6px" }}
      >
        Coupling Groups
      </div>

      {/* New group form */}
      <div
        className="coupling-groups-panel__new-group"
        style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "10px" }}
      >
        <input
          aria-label="New group name"
          placeholder="Group name…"
          style={{
            border: "1px solid #4b5563",
            borderRadius: "3px",
            background: "#1e1e2e",
            color: "inherit",
            padding: "3px 6px",
            fontSize: "inherit",
          }}
          type="text"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreateGroup();
          }}
        />
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            <input
              checked={newLockX}
              type="checkbox"
              onChange={(e) => setNewLockX(e.target.checked)}
            />
            Lock X
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            <input
              checked={newLockY}
              type="checkbox"
              onChange={(e) => setNewLockY(e.target.checked)}
            />
            Lock Y
          </label>
          <button
            style={{
              marginLeft: "auto",
              padding: "2px 8px",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: "3px",
              cursor: "pointer",
              fontSize: "inherit",
            }}
            type="button"
            onClick={handleCreateGroup}
          >
            New Group
          </button>
        </div>
      </div>

      {/* Group list */}
      {groupEntries.length === 0 && (
        <div style={{ color: "#6b7280", fontStyle: "italic" }}>No coupling groups yet.</div>
      )}

      {groupEntries.map(([groupId, group], groupIdx) => {
        const color = _groupColor(groupIdx);
        const memberAxes = group.axesIds.map((aid) => axes.get(aid)).filter(Boolean);

        return (
          <div
            key={groupId}
            className="coupling-groups-panel__group"
            style={{
              border: `1px solid ${color}`,
              borderRadius: "4px",
              marginBottom: "6px",
              overflow: "hidden",
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDropOnGroup(groupId)}
          >
            {/* Group header */}
            <div
              style={{
                background: color,
                color: "#fff",
                padding: "3px 8px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span style={{ fontWeight: 600, flexGrow: 1 }}>{group.name}</span>
              <span
                style={{
                  fontSize: "0.7rem",
                  background: "rgba(0,0,0,0.25)",
                  borderRadius: "2px",
                  padding: "0 4px",
                }}
              >
                {group.lockX ? "X" : ""}
                {group.lockX && group.lockY ? "+" : ""}
                {group.lockY ? "Y" : ""}
                {!group.lockX && !group.lockY ? "free" : ""}
              </span>
              <button
                aria-label={`Delete group ${group.name}`}
                style={{
                  background: "none",
                  border: "none",
                  color: "#fff",
                  cursor: "pointer",
                  padding: "0 2px",
                  fontSize: "0.85rem",
                  lineHeight: 1,
                }}
                type="button"
                onClick={() => deleteCouplingGroup(groupId)}
              >
                ×
              </button>
            </div>

            {/* Axes badges */}
            <div
              style={{
                padding: "4px 6px",
                display: "flex",
                flexWrap: "wrap",
                gap: "4px",
                minHeight: "28px",
              }}
            >
              {memberAxes.length === 0 && (
                <span style={{ color: "#6b7280", fontStyle: "italic", fontSize: "0.75rem" }}>
                  Drop an axes header here
                </span>
              )}
              {memberAxes.map((axesEntry) => {
                if (!axesEntry) return null;
                return (
                  <span
                    key={axesEntry.id}
                    draggable
                    aria-label={`Axes ${axesEntry.id} in group ${group.name}`}
                    style={{
                      background: color,
                      color: "#fff",
                      borderRadius: "3px",
                      padding: "1px 6px",
                      fontSize: "0.75rem",
                      cursor: "grab",
                      userSelect: "none",
                    }}
                    onDragStart={() => handleDragStart(axesEntry.id)}
                  >
                    {axesEntry.id.slice(0, 8)}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CouplingGroupsPanel;
