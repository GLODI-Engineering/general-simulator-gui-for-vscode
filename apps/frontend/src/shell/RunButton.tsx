import type { KernelStatus } from "../store/ipc";
import { useSimSettingsStore } from "../store/sim-settings";

export interface RunButtonProps {
  status: KernelStatus;
  onRun: () => void;
  onCancel: () => void;
}

export function RunButton({ status, onRun, onCancel }: RunButtonProps) {
  const busy = status === "busy";
  const analysisType = useSimSettingsStore((state) => state.settings.analysisType);
  return (
    <button
      type="button"
      data-status={status}
      className={
        busy ? "run-button is-busy" : status === "error" ? "run-button error" : "run-button"
      }
      onClick={busy ? onCancel : onRun}
      aria-label={busy ? "Cancel simulation" : "Run simulation"}
    >
      {busy ? "Stop" : `Run ${analysisType}`}
    </button>
  );
}

export default RunButton;
