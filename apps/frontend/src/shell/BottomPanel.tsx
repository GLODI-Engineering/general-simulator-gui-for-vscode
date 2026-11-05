import { useUiStore } from "../store";
import { listBottomTabs } from "./registries/BottomTabRegistry";

export function BottomPanel() {
  const visible = useUiStore((state) => state.bottomPanelVisible);
  const activeTabId = useUiStore((state) => state.activeBottomTabId);
  const focusBottomTab = useUiStore((state) => state.focusBottomTab);
  const height = useUiStore((state) => state.bottomPanelHeight);
  const setHeight = useUiStore((state) => state.setBottomPanelHeight);
  const tabs = listBottomTabs();
  const tab = tabs.find((entry) => entry.id === activeTabId);

  if (!visible || !tab) {
    return null;
  }

  const Component = tab.component;

  return (
    <section className="bottom-panel" style={{ height }} aria-label="Bottom panel">
      <div className="bottom-panel__tabs">
        {tabs.map((entry) => {
          const badge = entry.badge?.();
          return (
            <button
              key={entry.id}
              type="button"
              className={
                entry.id === activeTabId ? "bottom-panel__tab is-active" : "bottom-panel__tab"
              }
              onClick={() => {
                focusBottomTab(entry.id);
              }}
            >
              <span>{entry.label}</span>
              {badge !== null && badge !== undefined ? (
                <span className="bottom-panel__badge">{badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="bottom-panel__body">
        <Component />
      </div>
      <input
        className="bottom-panel__resize"
        aria-label="Resize bottom panel"
        type="range"
        min={160}
        max={420}
        value={height}
        onChange={(event) => {
          setHeight(Number(event.currentTarget.value));
        }}
      />
    </section>
  );
}
