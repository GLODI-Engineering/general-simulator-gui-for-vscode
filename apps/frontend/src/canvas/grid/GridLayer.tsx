import { useMemo } from "react";

import { useGraphStore, useUiStore } from "../../store";
import { toScreen } from "../coords";
import { thinGrid } from "./grid";

interface GridLayerProps {
  width: number;
  height: number;
}

export function GridLayer({ width, height }: GridLayerProps) {
  const gridStep = useGraphStore((state) => state.document.model.grid);
  const zoom = useUiStore((state) => state.zoom);
  const pan = useUiStore((state) => state.pan);

  const dots = useMemo(
    () =>
      thinGrid(gridStep, {
        width,
        height,
        zoom,
        panX: pan.x,
        panY: pan.y,
      }),
    [gridStep, height, pan.x, pan.y, width, zoom],
  );

  return (
    <svg className="grid-layer" width={width} height={height} aria-hidden="true">
      {dots.map((dot) => {
        const screen = toScreen(dot, { zoom, panX: pan.x, panY: pan.y });
        return (
          <circle key={`${dot.x}:${dot.y}`} cx={screen.x} cy={screen.y} r={1} fill="#d1d5db" />
        );
      })}
    </svg>
  );
}

export default GridLayer;
