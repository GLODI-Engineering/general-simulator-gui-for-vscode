import type { DragEvent } from "react";

export interface SignalMeta {
  quantity: string;
  unit: string;
}

export interface SignalRowProps {
  simId: string;
  signalName: string;
  meta?: SignalMeta;
  isStreaming: boolean;
  onContextMenu: (event: MouseEvent, simId: string, signalName: string) => void;
}

const QUANTITY_ICONS: Record<string, string> = {
  voltage: "V",
  current: "A",
  power: "W",
  frequency: "Hz",
  resistance: "Ω",
  dimensionless: "#",
};

function quantityIcon(quantity: string): string {
  return QUANTITY_ICONS[quantity] ?? "~";
}

export function SignalRow({ simId, signalName, meta, isStreaming, onContextMenu }: SignalRowProps) {
  const quantity = meta?.quantity ?? "–";
  const unit = meta?.unit ?? "–";
  const icon = quantity !== "–" ? quantityIcon(quantity) : "~";

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.effectAllowed = "copy";
    // "application/x-signal" — a distinct MIME key from the axes-header's
    // own "text/plain" axes-link drag (see Axes.tsx's handleDrop), so a
    // drop target can tell "a signal was dropped" from "an axes was
    // dropped" without guessing from the payload shape (FE-160: the two
    // used to collide on "text/plain", so dropping a signal was silently
    // misread as an axes id).
    event.dataTransfer.setData("application/x-signal", JSON.stringify({ simId, signalName }));
  }

  function handleContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    onContextMenu(event.nativeEvent, simId, signalName);
  }

  return (
    <div
      className="signal-row"
      draggable
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu}
      title={signalName}
    >
      <span className="signal-row__icon" aria-label={`quantity: ${quantity}`}>
        {icon}
      </span>
      <span className="signal-row__name">{signalName}</span>
      <span className="signal-row__unit">{unit}</span>
      {isStreaming && <span className="signal-row__streaming" aria-label="streaming" />}
    </div>
  );
}

export default SignalRow;
