/**
 * FE-58: SubsystemBlock.tsx
 *
 * Canvas block renderer for hierarchy.subsystem.* blocks.
 * Renders boundary ports derived from subsystem.ports[], with an extra
 * `enable` port for enabled subsystems and `trigger` port for triggered ones.
 * Double-click navigates into the subsystem body.
 */

import type { Block, SubsystemPort } from "../model/types";

export interface SubsystemBlockProps {
  block: Block;
  selected?: boolean;
  /** Called when the user double-clicks to navigate into the subsystem. */
  onNavigateInto?: (blockId: string) => void;
}

function portLabel(port: SubsystemPort): string {
  return port.id;
}

/**
 * Returns the list of ports visible on the parent-side subsystem block.
 * For enabled subsystems the enable port is included.
 * For triggered subsystems the trigger port is included.
 */
export function getSubsystemBoundaryPorts(block: Block): SubsystemPort[] {
  const ports: SubsystemPort[] = [...(block.subsystem?.ports ?? [])];

  if (block.type === "hierarchy.subsystem.enabled") {
    const enablePortName =
      typeof block.params.enable_port_name === "string" ? block.params.enable_port_name : "enable";
    // Only add if not already present (guard against double-sync)
    if (!ports.some((p) => p.id === enablePortName)) {
      ports.push({
        id: enablePortName,
        direction: "in",
        kind: "signal",
        boundary_block: "__enable__",
      });
    }
  }

  if (block.type === "hierarchy.subsystem.triggered") {
    const triggerPortName =
      typeof block.params.trigger_port_name === "string"
        ? block.params.trigger_port_name
        : "trigger";
    if (!ports.some((p) => p.id === triggerPortName)) {
      ports.push({
        id: triggerPortName,
        direction: "in",
        kind: "signal",
        boundary_block: "__trigger__",
      });
    }
  }

  return ports;
}

export function SubsystemBlock({ block, selected, onNavigateInto }: SubsystemBlockProps) {
  const boundaryPorts = getSubsystemBoundaryPorts(block);
  const inputPorts = boundaryPorts.filter((p) => p.direction === "in");
  const outputPorts = boundaryPorts.filter((p) => p.direction === "out");

  const isEnabled = block.type === "hierarchy.subsystem.enabled";
  const isTriggered = block.type === "hierarchy.subsystem.triggered";

  const label = isEnabled
    ? "En Sub"
    : isTriggered
      ? "Tr Sub"
      : block.type === "hierarchy.subsystem.virtual"
        ? "vSub"
        : "Sub";

  return (
    <button
      type="button"
      className={`canvas-node subsystem-block${selected ? " is-selected" : ""}`}
      data-block-type={block.type}
      data-block-id={block.id}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onNavigateInto?.(block.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") onNavigateInto?.(block.id);
      }}
      aria-label={`Subsystem: ${block.label ?? block.id}`}
    >
      <div className="subsystem-block__label">{label}</div>
      {inputPorts.length > 0 && (
        <div className="subsystem-block__ports subsystem-block__ports--in">
          {inputPorts.map((port) => (
            <div
              key={port.id}
              className="subsystem-block__port subsystem-block__port--in"
              data-port-id={port.id}
              data-port-kind={port.kind}
              title={portLabel(port)}
            >
              <span className="subsystem-block__port-label">{port.id}</span>
            </div>
          ))}
        </div>
      )}
      {outputPorts.length > 0 && (
        <div className="subsystem-block__ports subsystem-block__ports--out">
          {outputPorts.map((port) => (
            <div
              key={port.id}
              className="subsystem-block__port subsystem-block__port--out"
              data-port-id={port.id}
              data-port-kind={port.kind}
              title={portLabel(port)}
            >
              <span className="subsystem-block__port-label">{port.id}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

export default SubsystemBlock;
