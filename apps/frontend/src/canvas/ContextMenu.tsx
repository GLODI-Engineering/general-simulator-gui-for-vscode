import { useEffect, useMemo, useRef, useState } from "react";

export interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  tiers: string[];
  currentTier: string;
  onSelectTier: (tier: string) => void;
  onClose: () => void;
}

export function ContextMenu({
  open,
  x,
  y,
  tiers,
  currentTier,
  onSelectTier,
  onClose,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [submenuOpen, setSubmenuOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && ref.current && ref.current.contains(target)) {
        return;
      }
      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, onClose]);

  const supported = useMemo(() => tiers.length >= 2, [tiers.length]);
  if (!open || !supported) {
    return null;
  }

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 1000,
        background: "var(--panel-bg, #1e1e1e)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 6,
        padding: 6,
        minWidth: 180,
        color: "var(--text, #fff)",
      }}
      role="menu"
      aria-label="Context menu"
      onMouseLeave={() => {
        setSubmenuOpen(false);
      }}
    >
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={submenuOpen}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 8px",
          cursor: "default",
          userSelect: "none",
          background: "transparent",
          color: "inherit",
          border: "none",
          width: "100%",
          textAlign: "left",
        }}
        onMouseEnter={() => {
          setSubmenuOpen(true);
        }}
        onClick={() => {
          setSubmenuOpen((value) => !value);
        }}
      >
        <span>Change fidelity</span>
        <span aria-hidden>{"▶"}</span>
      </button>

      {submenuOpen ? (
        <div
          style={{
            position: "absolute",
            left: "100%",
            top: 6,
            marginLeft: 6,
            background: "var(--panel-bg, #1e1e1e)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: 6,
            minWidth: 160,
          }}
          role="menu"
          aria-label="Change fidelity"
        >
          {tiers.map((tier) => (
            <button
              key={tier}
              type="button"
              role="menuitem"
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "6px 8px",
                cursor: "pointer",
                userSelect: "none",
                background: "transparent",
                color: "inherit",
                border: "none",
                width: "100%",
                textAlign: "left",
              }}
              onClick={() => {
                onSelectTier(tier);
                onClose();
              }}
            >
              <span>{tier}</span>
              <span aria-hidden>{tier === currentTier ? "✓" : ""}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default ContextMenu;
