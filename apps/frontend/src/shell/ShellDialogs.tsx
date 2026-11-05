import { useEffect, useState } from "react";

import { ParamTable } from "../inspector/ParamTable";
import { SimSettingsPanel } from "../simulation/SimSettingsPanel";
import { useGraphStore, useUiStore } from "../store";
import { AboutDialog, KeyboardShortcutsDialog } from "./AboutDialog";

/**
 * The dialogs and global keybindings that used to hang off `shell/TopBar`.
 *
 * TopBar itself was the application menu bar — File/Edit/Selection/View/Help
 * dropdowns whose items all dispatched into `App`'s `handleAction`. VS Code
 * supplies that menu bar (and a command palette) once the canvas is hosted in
 * a custom editor, so the menu is gone; but the four dialogs it owned and the
 * two global shortcuts it installed are real functionality, so they live on
 * here, mounted by `App` and driven by events rather than by menu clicks.
 *
 * Opened by:
 * - `gensim:open-sim-settings`  — dispatched by the `simulate.config` action
 * - `gensim:open-model-params`  — the .PARAM table
 * - `gensim:open-about`         — About General Simulator
 * - `gensim:open-shortcuts`     — Keyboard Shortcuts
 * - `Ctrl+Shift+R`              — simulation settings
 * - `Ctrl+Alt+D`                — toggle the signal-dimension overlay (FE-65)
 *
 * Routing these through events rather than props keeps them reachable from the
 * in-app command palette *and* from VS Code commands contributed by the
 * extension, without either surface needing a React handle.
 */
export function ShellDialogs() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const modelParams = useGraphStore((state) => state.document.model.params);
  const toggleDimLabels = useUiStore((state) => state.toggleDimLabels);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        setSettingsOpen(true);
      }
      // Ctrl+Alt+D — toggle Signal dimensions overlay (FE-65)
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        toggleDimLabels();
      }
    };
    const openSettings = () => setSettingsOpen(true);
    const openParams = () => setParamsOpen(true);
    const openAbout = () => setAboutOpen(true);
    const openShortcuts = () => setShortcutsOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("gensim:open-sim-settings", openSettings);
    window.addEventListener("gensim:open-model-params", openParams);
    window.addEventListener("gensim:open-about", openAbout);
    window.addEventListener("gensim:open-shortcuts", openShortcuts);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("gensim:open-sim-settings", openSettings);
      window.removeEventListener("gensim:open-model-params", openParams);
      window.removeEventListener("gensim:open-about", openAbout);
      window.removeEventListener("gensim:open-shortcuts", openShortcuts);
    };
  }, [toggleDimLabels]);

  return (
    <>
      {/* Model parameters (.PARAM) side drawer */}
      {paramsOpen ? (
        <div className="params-drawer-backdrop" onMouseDown={() => setParamsOpen(false)}>
          <div className="params-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="params-drawer__header">
              <strong>Model Parameters (.PARAM)</strong>
              <button
                type="button"
                aria-label="Close params drawer"
                onClick={() => setParamsOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="params-drawer__body">
              <ParamTable
                params={modelParams.map((p) => ({
                  name: p.name,
                  value: (p.value as string | number) ?? 0,
                  unit: p.unit,
                  doc: p.doc,
                }))}
                onChange={(updated) => {
                  const graph = useGraphStore.getState();
                  graph.transact("update model params", () => {
                    graph.setModelParams(updated);
                  });
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Simulation settings dialog */}
      {settingsOpen ? (
        <div className="sim-settings-backdrop" onMouseDown={() => setSettingsOpen(false)}>
          <div className="sim-settings-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <SimSettingsPanel onClose={() => setSettingsOpen(false)} />
          </div>
        </div>
      ) : null}

      {aboutOpen ? <AboutDialog onClose={() => setAboutOpen(false)} /> : null}
      {shortcutsOpen ? <KeyboardShortcutsDialog onClose={() => setShortcutsOpen(false)} /> : null}
    </>
  );
}

export default ShellDialogs;
