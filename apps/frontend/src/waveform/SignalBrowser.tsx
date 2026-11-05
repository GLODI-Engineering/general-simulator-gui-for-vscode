import { useEffect, useRef, useState } from "react";

import { useIpcStore } from "../store/ipc";
import { useWaveformStore } from "../store/waveform";
import { SignalRow } from "./SignalRow";

interface ContextMenuState {
  x: number;
  y: number;
  simId: string;
  signalName: string;
}

export function SignalBrowser() {
  const lastManifest = useIpcStore((state) => state.lastManifest);
  const streamingSignals = useWaveformStore((state) => state.streamingSignals);
  const figures = useWaveformStore((state) => state.figures);
  const axes = useWaveformStore((state) => state.axes);
  const addSignalToAxes = useWaveformStore((state) => state.addSignalToAxes);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Build the list of sim files from the manifest.
  // The manifest holds the most recent simulation; the browser shows whatever
  // signals are currently available.
  const simGroups: Array<{ simId: string; signals: string[] }> = lastManifest
    ? [{ simId: lastManifest.sim_id, signals: lastManifest.signals }]
    : [];

  function toggleSection(simId: string) {
    setCollapsed((prev) => ({ ...prev, [simId]: !prev[simId] }));
  }

  function handleContextMenu(event: MouseEvent, simId: string, signalName: string) {
    setContextMenu({ x: event.clientX, y: event.clientY, simId, signalName });
  }

  // Close the context menu when clicking outside.
  useEffect(() => {
    if (!contextMenu) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [contextMenu]);

  // Build axes menu entries sorted by figure name then row/col.
  const axesEntries = [...axes.values()].map((axesEntry) => {
    const figure = figures.get(axesEntry.figureId);
    const figureName = figure?.name ?? "Figure";
    return {
      axesId: axesEntry.id,
      label: `${figureName} → Axes (${axesEntry.row},${axesEntry.col})`,
    };
  });

  return (
    <div className="signal-browser">
      {simGroups.length === 0 && (
        <p className="signal-browser__empty">No simulation results available.</p>
      )}
      {simGroups.map(({ simId, signals }) => {
        const isCollapsed = collapsed[simId] ?? false;
        return (
          <section key={simId} className="signal-browser__section">
            <button
              type="button"
              className="signal-browser__header"
              aria-expanded={!isCollapsed}
              onClick={() => toggleSection(simId)}
            >
              <span className="signal-browser__chevron">{isCollapsed ? "▶" : "▼"}</span>
              <span className="signal-browser__sim-id" title={simId}>
                {simId}
              </span>
              <span className="signal-browser__count">{signals.length}</span>
            </button>
            {!isCollapsed && (
              <ul className="signal-browser__signals">
                {signals.map((signalName) => {
                  const streamingKey = `${simId}::${signalName}`;
                  const isStreaming = streamingSignals.has(streamingKey);
                  return (
                    <li key={signalName} className="signal-browser__signal-item">
                      <SignalRow
                        simId={simId}
                        signalName={signalName}
                        isStreaming={isStreaming}
                        onContextMenu={handleContextMenu}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {contextMenu && (
        <div
          ref={menuRef}
          className="signal-browser__context-menu"
          style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          {axesEntries.length === 0 && (
            <span className="signal-browser__context-menu-empty">No axes available</span>
          )}
          {axesEntries.map(({ axesId, label }) => (
            <button
              key={axesId}
              type="button"
              className="signal-browser__context-menu-item"
              role="menuitem"
              onClick={() => {
                addSignalToAxes(axesId, contextMenu.simId, contextMenu.signalName);
                setContextMenu(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SignalBrowser;
