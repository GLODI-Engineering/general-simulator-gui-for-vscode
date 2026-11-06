/**
 * The list of signals a result holds, and the way to put one on an axes.
 *
 * Two things it has to get right:
 *
 * 1. **Where the signals come from.** It used to read only the live kernel's
 *    last manifest, so opening a saved `.gsim_sim_result` showed "No
 *    simulation results available" over a browser that was empty — while
 *    three populated charts sat next to it. The signals are in the waveform
 *    store either way; the manifest is one source of them, not the source.
 *
 * 2. **Where a ticked signal goes.** Something has to answer "add it
 *    where?". An implicit notion of focus answers it differently depending
 *    on where the pointer last was, so the target is explicit and shown.
 */
import { useEffect, useMemo, useRef, useState } from "react";

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

  const signalCache = useWaveformStore((state) => state.signalCache);
  const activeAxesId = useWaveformStore((state) => state.activeAxesId);
  const setActiveAxes = useWaveformStore((state) => state.setActiveAxes);
  const removeSignalFromAxes = useWaveformStore((state) => state.removeSignalFromAxes);

  /**
   * Every signal available, from the live manifest and from whatever is
   * already decoded in the store, merged by sim.
   *
   * The manifest can name signals that have not been fetched yet (a live run
   * still streaming); the cache can hold signals no manifest ever described
   * (a result opened from a file). Both are real, so the browser lists the
   * union rather than picking one.
   */
  const simGroups = useMemo(() => {
    const bySim = new Map<string, Set<string>>();
    const add = (simId: string, name: string) => {
      const bucket = bySim.get(simId);
      if (bucket) bucket.add(name);
      else bySim.set(simId, new Set([name]));
    };
    if (lastManifest) {
      for (const name of lastManifest.signals) add(lastManifest.sim_id, name);
    }
    for (const signal of signalCache.values()) add(signal.simId, signal.name);
    return [...bySim.entries()].map(([simId, names]) => ({
      simId,
      signals: [...names].sort((a, b) => a.localeCompare(b)),
    }));
  }, [lastManifest, signalCache]);

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
  const axesEntries = [...axes.values()]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((axesEntry) => {
      const figure = figures.get(axesEntry.figureId);
      const figureName = figure?.name ?? "Figure";
      return {
        axesId: axesEntry.id,
        label: `${figureName} → Axes (${axesEntry.row},${axesEntry.col})`,
      };
    });

  const targetAxesId =
    activeAxesId && axes.has(activeAxesId) ? activeAxesId : (axesEntries[0]?.axesId ?? null);
  const targetAxes = targetAxesId ? axes.get(targetAxesId) : undefined;

  const onTarget = useMemo(() => {
    const keys = new Set<string>();
    for (const ref of targetAxes?.signals ?? []) keys.add(`${ref.simId}::${ref.signalName}`);
    return keys;
  }, [targetAxes]);

  function toggleOnTarget(simId: string, signalName: string, checked: boolean) {
    if (!targetAxesId) return;
    if (checked) addSignalToAxes(targetAxesId, simId, signalName);
    else removeSignalFromAxes(targetAxesId, simId, signalName);
  }

  return (
    <div className="signal-browser">
      {axesEntries.length > 0 && (
        <div className="signal-browser__target">
          <label htmlFor="signal-browser-target">Add to</label>
          <select
            id="signal-browser-target"
            value={targetAxesId ?? ""}
            onChange={(event) => setActiveAxes(event.target.value || null)}
          >
            {axesEntries.map(({ axesId, label }) => (
              <option key={axesId} value={axesId}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
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
                      <input
                        type="checkbox"
                        className="signal-browser__check"
                        checked={onTarget.has(streamingKey)}
                        disabled={targetAxesId === null}
                        aria-label={`Plot ${signalName}`}
                        title={
                          targetAxesId === null
                            ? "Create an axes first"
                            : `Plot ${signalName} on the selected axes`
                        }
                        onChange={(event) =>
                          toggleOnTarget(simId, signalName, event.target.checked)
                        }
                      />
                      <SignalRow
                        simId={simId}
                        signalName={signalName}
                        isStreaming={isStreaming}
                        onContextMenu={handleContextMenu}
                      />
                      {/* The unit is what decides whether this signal lands
                          on the existing y-axis or gets one of its own, so
                          it belongs where the choice is made. */}
                      <span className="signal-browser__quantity">
                        {signalCache.get(streamingKey)?.unit ?? ""}
                      </span>
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
