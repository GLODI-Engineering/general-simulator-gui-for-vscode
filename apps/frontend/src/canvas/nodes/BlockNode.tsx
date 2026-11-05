import { memo } from "react";
import { Handle, type NodeProps, Position } from "reactflow";

import type { FlowBlockData } from "../derive-flow-state";
import { isSubcktInstance } from "../subckt-metadata";
import { BlockSymbol } from "./BlockSymbol";
import { SYMBOL_SCALE, getMetadataPortCenters } from "./port-hit-test";
import { resolveBlockBbox } from "./resolve-ports";

function BlockNodeImpl({ data, selected }: NodeProps<FlowBlockData>) {
  const metadata = data.metadata;
  if (data.block.type === "routing.junction") {
    return (
      <div className="canvas-node canvas-node--junction" data-block-id={data.block.id}>
        <Handle id="node" type="source" position={Position.Right} isConnectable={false} />
        <Handle id="node" type="target" position={Position.Left} isConnectable={false} />
      </div>
    );
  }
  if (!metadata) {
    // Nothing renderable: an unknown catalog type, or a spice-subckt instance
    // with no `subckt_ref` at all. (A `subckt_ref` that names no def still
    // resolves — to a plain "subcircuit" box captioned with the raw ref.)
    // Explicit broken state rather than a silent bare box.
    const message = isSubcktInstance(data.block)
      ? "subcircuit: missing subckt_ref"
      : `unknown block "${data.block.type}"`;
    return (
      <div
        className={
          selected
            ? "canvas-node canvas-node--broken is-selected"
            : "canvas-node canvas-node--broken"
        }
        data-block-type={data.block.type}
        data-block-id={data.block.id}
        title={message}
      >
        {message}
      </div>
    );
  }

  const [symbolWidth, symbolHeight] = resolveBlockBbox(metadata, data.block.params);
  // Display width (after SYMBOL_SCALE); swaps for 90/270 rotation.
  const width =
    (data.block.rotation === 90 || data.block.rotation === 270 ? symbolHeight : symbolWidth) *
    SYMBOL_SCALE;

  // Port center is in model/flow coordinates. We use it directly as the CSS
  // offset from the node div origin (no padding bias).  The SVG inside BlockSymbol
  // now has padding=0 so the SVG origin == the block's model position, and the
  // handle's flow position equals the model port centre exactly.  This keeps
  // wire start/end aligned with routing waypoints (same coordinate system).
  const handles = getMetadataPortCenters(data.block, metadata).map((port) => {
    const relX = port.stubTip.x - data.block.position[0];
    const relY = port.stubTip.y - data.block.position[1];
    const side =
      Math.abs(relX) <= 1
        ? Position.Left
        : Math.abs(relX - width) <= 1
          ? Position.Right
          : Math.abs(relY) <= 1
            ? Position.Top
            : Position.Bottom;
    return {
      id: port.id,
      left: relX,
      top: relY,
      position: side,
    };
  });

  return (
    <div
      className={selected ? "canvas-node is-selected" : "canvas-node"}
      data-block-type={data.block.type}
      data-block-id={data.block.id}
    >
      <BlockSymbol
        metadata={metadata}
        rotation={data.block.rotation}
        mirror={data.block.mirror}
        params={data.block.params}
        blockPosition={data.block.position}
        label={data.displayLabel ?? data.block.label}
      />
      {handles.flatMap((handle) =>
        (["source", "target"] as const).map((type) => (
          <Handle
            key={`${handle.id}-${type}`}
            id={handle.id}
            type={type}
            position={handle.position}
            isConnectable={false}
            style={{
              left: handle.left,
              top: handle.top,
              width: 1,
              height: 1,
              // ReactFlow's own .react-flow__handle CSS sets min-width/min-height: 5px,
              // which silently overrides the 1x1 size above (min-* always wins over a
              // smaller explicit width/height). For a Position.Top/Bottom handle, the
              // matching .react-flow__handle-top/-bottom class only compensates
              // horizontally (transform: translate(-50%, 0)) — nothing shifts the box
              // back up after its height balloons to the forced 5px — so ReactFlow's
              // own connection point (the rendered box's centre) ended up ~2.5px below
              // `top`, not on it: wires visibly missed the port on the Y axis. Pinning
              // min-width/min-height to match width/height here removes that floor.
              minWidth: 1,
              minHeight: 1,
              border: 0,
              opacity: 0,
              pointerEvents: "none",
            }}
          />
        )),
      )}
    </div>
  );
}

export const BlockNode = memo(BlockNodeImpl, (prev, next) => {
  if (prev.selected !== next.selected) return false;
  if (prev.data.block === next.data.block && prev.data.metadata === next.data.metadata) return true;
  const a = prev.data.block;
  const b = next.data.block;
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.rotation === b.rotation &&
    a.mirror === b.mirror &&
    a.position[0] === b.position[0] &&
    a.position[1] === b.position[1] &&
    a.params === b.params &&
    prev.data.metadata === next.data.metadata
  );
});

export default BlockNode;
