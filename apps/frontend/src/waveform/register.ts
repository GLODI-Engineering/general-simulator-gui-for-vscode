import { registerEditorTab } from "../shell/EditorTabRegistry";
import { WaveformTab } from "./WaveformTab";

export function registerWaveformTab(): void {
  registerEditorTab({ id: "core.waveform", label: "Waveforms", order: 10, component: WaveformTab });
}

export default registerWaveformTab;
