import { useRef, useState } from "react";

interface FigureTabProps {
  id: string;
  name: string;
  isActive: boolean;
  onActivate: () => void;
  onRename: (newName: string) => void;
  onDeleteRequest: () => void;
}

export function FigureTab({
  id: _id,
  name,
  isActive,
  onActivate,
  onRename,
  onDeleteRequest,
}: FigureTabProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onRename(trimmed);
    } else {
      setDraft(name);
    }
    setEditing(false);
  }

  function handleDoubleClick() {
    setDraft(name);
    setEditing(true);
    // Focus is set via useEffect-equivalent — defer to next tick.
    requestAnimationFrame(() => {
      inputRef.current?.select();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      commitRename();
    } else if (e.key === "Escape") {
      setDraft(name);
      setEditing(false);
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    onDeleteRequest();
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={`figure-tab${isActive ? " figure-tab--active" : ""}`}
      onClick={onActivate}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="figure-tab__rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={handleKeyDown}
          // Prevent click propagation from triggering onActivate again.
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="figure-tab__label">{name}</span>
      )}
    </button>
  );
}

export default FigureTab;
