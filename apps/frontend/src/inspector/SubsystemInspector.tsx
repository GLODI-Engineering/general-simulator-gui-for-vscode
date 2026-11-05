/**
 * FE-58: SubsystemInspector.tsx
 *
 * Inspector panel for hierarchy.subsystem.* blocks. Shows:
 * - Boundary port list (id, direction, kind)
 * - For enabled subsystems: enable-port name editor
 * - For triggered subsystems: trigger-port name editor + trigger_kind selector
 *
 * The wire-drag compatibility check (same affordance as FE-56) is enforced
 * at the port level: enable/trigger ports carry kind=signal and dim=[1], so
 * the existing port-compat module will refuse mismatched drags.
 */

import type { Block } from "../model/types";
import { useGraphStore } from "../store";
import { deriveBoundaryPorts } from "../store/model";
import { Dropdown } from "./editors/Dropdown";
import { StringInput } from "./editors/StringInput";

interface Props {
  block: Block;
}

function commitParam(blockId: string, key: string, value: string) {
  const graph = useGraphStore.getState();
  graph.transact(`set ${key}`, () => {
    graph.setParam(blockId, key, value);
  });
}

export function SubsystemInspector({ block }: Props) {
  const isEnabled = block.type === "hierarchy.subsystem.enabled";
  const isTriggered = block.type === "hierarchy.subsystem.triggered";

  const boundaryPorts = deriveBoundaryPorts(block.subsystem?.blocks ?? []);

  const enablePortName =
    typeof block.params.enable_port_name === "string" ? block.params.enable_port_name : "enable";

  const triggerPortName =
    typeof block.params.trigger_port_name === "string" ? block.params.trigger_port_name : "trigger";

  const triggerKind =
    typeof block.params.trigger_kind === "string" ? block.params.trigger_kind : "rising";

  return (
    <section className="inspector-panel">
      <header className="inspector-panel__header">
        <strong>
          {isEnabled ? "Enabled Subsystem" : isTriggered ? "Triggered Subsystem" : "Subsystem"}
        </strong>
        <span>{block.id}</span>
      </header>
      <div className="inspector-panel__body">
        {/* Boundary ports list */}
        <div className="inspector-field">
          <span className="inspector-label">Boundary ports</span>
          {boundaryPorts.length === 0 ? (
            <span className="inspector-hint">
              No inport/outport blocks inside this subsystem yet.
            </span>
          ) : (
            <ul className="subsystem-port-list">
              {boundaryPorts.map((port) => (
                <li key={port.id} className="subsystem-port-list__item">
                  <span className="subsystem-port-list__id">{port.id}</span>
                  <span className="subsystem-port-list__dir">{port.direction}</span>
                  <span className="subsystem-port-list__kind">{port.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Enable port name (enabled subsystems only) */}
        {isEnabled && (
          <StringInput
            label="Enable port name"
            value={enablePortName}
            onCommit={(next) => {
              commitParam(block.id, "enable_port_name", next);
            }}
          />
        )}

        {/* Trigger port + kind (triggered subsystems only) */}
        {isTriggered && (
          <>
            <StringInput
              label="Trigger port name"
              value={triggerPortName}
              onCommit={(next) => {
                commitParam(block.id, "trigger_port_name", next);
              }}
            />
            <Dropdown
              label="Trigger edge"
              value={triggerKind}
              choices={["rising", "falling", "either"]}
              onCommit={(next) => {
                commitParam(block.id, "trigger_kind", next);
              }}
            />
          </>
        )}

        {/* Double-click hint */}
        <div className="inspector-hint" style={{ marginTop: 8, fontSize: 11, color: "#888" }}>
          Double-click the block on the canvas to navigate into it.
        </div>
      </div>
    </section>
  );
}

export default SubsystemInspector;
