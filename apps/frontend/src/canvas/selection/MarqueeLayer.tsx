import type { CSSProperties } from "react";

import type { MarqueeRect } from "./Selection";

interface MarqueeLayerProps {
  rect: MarqueeRect | null;
}

export function MarqueeLayer({ rect }: MarqueeLayerProps) {
  if (!rect) {
    return null;
  }

  const style: CSSProperties = {
    left: Math.min(rect.x, rect.x + rect.width),
    top: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };

  return <div className="marquee-layer" style={style} />;
}

export default MarqueeLayer;
