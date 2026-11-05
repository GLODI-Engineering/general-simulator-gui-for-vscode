import { DND_BLOCK_TYPE, encodeBlockPayload, setActiveDragBlock } from "../canvas/dnd";
import { BlockSymbol } from "../canvas/nodes/BlockSymbol";
import type { BlockMetadata, ParamValue } from "../model/types";

interface SidebarItemProps {
  entry: BlockMetadata;
  onInsert: (entry: BlockMetadata) => void;
  onOpenVariants?: (entry: BlockMetadata) => void;
}

export function SidebarItem({ entry, onInsert, onOpenVariants }: SidebarItemProps) {
  const handleDragStart = (event: React.DragEvent<HTMLButtonElement>) => {
    setActiveDragBlock(entry.name, entry.label);
    event.dataTransfer.setData(DND_BLOCK_TYPE, encodeBlockPayload(entry.name));
    event.dataTransfer.setData("text/plain", entry.name);
    event.dataTransfer.effectAllowed = "copy";

    const dragImage = document.createElement("span");
    dragImage.textContent = entry.label;
    dragImage.style.cssText =
      "position:absolute;top:-9999px;left:-9999px;padding:4px 8px;background:#333;color:#fff;border-radius:4px;font-size:12px;pointer-events:none;";
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => dragImage.remove(), 0);
  };

  const handleDragEnd = () => {
    setActiveDragBlock(null);
  };

  const defaultParams: Record<string, ParamValue> = Object.fromEntries(
    (entry.params ?? []).map((p) => [p.name, (p.default ?? null) as ParamValue]),
  );

  return (
    <button
      type="button"
      className="library-item"
      title={entry.description}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => {
        onInsert(entry);
      }}
      onDoubleClick={() => {
        onOpenVariants?.(entry);
      }}
    >
      {entry.symbol?.bbox && entry.ports ? (
        <span className="library-item__preview" aria-hidden="true">
          <BlockSymbol
            metadata={entry}
            rotation={0}
            mirror="none"
            params={defaultParams}
            showLabels={false}
          />
        </span>
      ) : (
        <span className="library-item__preview" aria-hidden="true" />
      )}
      <span className="library-item__label">{entry.label}</span>
    </button>
  );
}
