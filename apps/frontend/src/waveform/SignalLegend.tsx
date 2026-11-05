export interface SignalLegendProps {
  labels: string[];
  activeLabel: string | null;
  onSelect: (label: string) => void;
  variant?: "legacy" | "vscode";
}

export function SignalLegend({
  labels,
  activeLabel,
  onSelect,
  variant = "legacy",
}: SignalLegendProps) {
  return (
    <div
      className={
        variant === "vscode" ? "waveform-legend waveform-legend--vscode" : "waveform-legend"
      }
    >
      {labels.map((label) => (
        <button
          key={label}
          type="button"
          className={
            label === activeLabel ? "waveform-legend__item is-active" : "waveform-legend__item"
          }
          onClick={() => onSelect(label)}
          title={label}
        >
          <span className="waveform-legend__text">{label}</span>
        </button>
      ))}
    </div>
  );
}

export default SignalLegend;
