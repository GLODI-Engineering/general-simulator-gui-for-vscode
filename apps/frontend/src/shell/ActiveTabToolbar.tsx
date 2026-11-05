import { useIpcStore } from "../store";
import { listEditorTabs } from "./EditorTabRegistry";
import { Sep } from "./ToolbarControls";

export interface ActiveTabToolbarProps {
  onAction: (actionId: string) => void;
}

/**
 * The tab-specific *segment* of the single toolbar row — rendered inline by
 * shell/MainToolbar.tsx, appended after the always-visible File/Run
 * controls in the same row, not as a separate row of its own. Content
 * swaps based on which editor tab (Schematic / Waveforms / Netlist) is
 * active — e.g. canvas/SchematicToolbar.tsx for the Schematic tab,
 * registered via the `toolbar` field on EditorTabRegistration (see
 * canvas/register.ts). Renders nothing for tabs with no registered
 * toolbar (Waveforms, Netlist today) — including the separator, so no
 * trailing "empty" divider shows.
 */
export function ActiveTabToolbar({ onAction }: ActiveTabToolbarProps) {
  const activeId = useIpcStore((state) => state.activeEditorTabId);
  const tabs = listEditorTabs();
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  if (!activeTab?.toolbar) {
    return null;
  }
  const ToolbarComponent = activeTab.toolbar;
  return (
    <>
      <Sep />
      <ToolbarComponent onAction={onAction} />
    </>
  );
}

export default ActiveTabToolbar;
