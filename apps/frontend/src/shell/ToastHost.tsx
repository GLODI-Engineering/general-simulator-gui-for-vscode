import { useToastStore } from "../store/toast";

export function ToastHost() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 2000,
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            background: "rgba(20,20,20,0.95)",
            color: "white",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            padding: "8px 10px",
            minWidth: 240,
            maxWidth: 360,
            pointerEvents: "auto",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <output style={{ display: "block", flex: 1, margin: 0 }}>{toast.message}</output>
          <button
            type="button"
            aria-label="Dismiss toast"
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              padding: 0,
              lineHeight: 1,
            }}
            onClick={() => removeToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default ToastHost;
