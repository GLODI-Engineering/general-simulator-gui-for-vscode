/**
 * Shared low-level building blocks for the app's toolbars — the always-
 * visible MainToolbar (shell/MainToolbar.tsx) and the Schematic-tab-only
 * SchematicToolbar (canvas/SchematicToolbar.tsx). Kept here, rather than
 * duplicated in both, so the two toolbars stay visually consistent.
 */

// ── Lucide icon wrapper (18 × 18, stroke-based) ─────────────────────────────

export function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// ── Generic toolbar button ────────────────────────────────────────────────

export function Btn({
  children,
  label,
  title,
  active = false,
  disabled = false,
  danger = false,
  onClick,
}: {
  children: React.ReactNode;
  label?: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  let cls = "gs-toolbar__btn";
  if (active && danger) cls += " is-active is-danger";
  else if (active) cls += " is-active";

  return (
    <button
      type="button"
      className={cls}
      title={title}
      aria-label={label ?? title}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      {label ? <span className="gs-toolbar__btn-label">{label}</span> : null}
    </button>
  );
}

// ── Vertical separator ──────────────────────────────────────────────────────

export function Sep() {
  return <div className="gs-toolbar__sep" aria-hidden="true" />;
}

/**
 * Redirects a plain vertical mouse-wheel gesture into horizontal scroll on a
 * toolbar element. FE-144: a horizontally-overflowing toolbar with a hidden
 * scrollbar gave no way to reach clipped buttons without knowing to
 * shift+scroll. Needs a real addEventListener (not JSX onWheel) because
 * React's synthetic wheel listener is passive by default, so
 * preventDefault() inside onWheel is silently ignored.
 *
 * Call from a `useEffect(() => attachHorizontalWheelScroll(ref.current), [])`
 * in each toolbar — kept as a plain function (not a hook) so callers control
 * the effect's dependency array.
 */
export function attachHorizontalWheelScroll(el: HTMLDivElement | null): () => void {
  if (!el) return () => {};
  const onWheel = (event: WheelEvent) => {
    if (event.deltaY === 0 || el.scrollWidth <= el.clientWidth) return;
    event.preventDefault();
    el.scrollLeft += event.deltaY;
  };
  el.addEventListener("wheel", onWheel, { passive: false });
  return () => el.removeEventListener("wheel", onWheel);
}

// ── Shared icon set ──────────────────────────────────────────────────────────

export const FilePlusIcon = () => (
  <Icon>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M9 15h6" />
    <path d="M12 12v6" />
  </Icon>
);

export const FolderOpenIcon = () => (
  <Icon>
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
  </Icon>
);

export const SaveIcon = () => (
  <Icon>
    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
    <path d="M7 3v4a1 1 0 0 0 1 1h7" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon>
    <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
  </Icon>
);

export const StopIcon = () => (
  <Icon>
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </Icon>
);

export const ShapesIcon = () => (
  <Icon>
    <path d="M8.3 10a.7.7 0 0 1-.626-1.079l4.995-8.19a.71.71 0 0 1 1.262 0l4.995 8.19A.7.7 0 0 1 18.3 10Z" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <circle cx="17.5" cy="17.5" r="3.5" />
  </Icon>
);
