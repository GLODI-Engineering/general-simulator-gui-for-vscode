interface PinWire {
  id: string;
  waypoints: number[];
  pinned: boolean;
}

export function pinBend(
  wire: PinWire,
  segmentIndex: number,
  store: { transact: (name: string, fn: () => void) => void },
) {
  let result = wire;
  store.transact("pin bend", () => {
    const x1 = wire.waypoints[segmentIndex * 2] ?? 0;
    const y1 = wire.waypoints[segmentIndex * 2 + 1] ?? 0;
    const x2 = wire.waypoints[segmentIndex * 2 + 2] ?? x1;
    const y2 = wire.waypoints[segmentIndex * 2 + 3] ?? y1;
    result = {
      ...wire,
      pinned: true,
      waypoints: [...wire.waypoints, Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)],
    };
  });
  return result;
}

export function unpinBend(
  wire: PinWire,
  store: { transact: (name: string, fn: () => void) => void },
) {
  let result = wire;
  store.transact("unpin bend", () => {
    result = { ...wire, pinned: false };
  });
  return result;
}

export function dragWaypoint(
  wire: PinWire,
  waypointIndex: number,
  point: { x: number; y: number },
  store: { transact: (name: string, fn: () => void) => void },
) {
  let result = wire;
  store.transact("drag waypoint", () => {
    const waypoints = [...wire.waypoints];
    waypoints[waypointIndex * 2] = Math.round(point.x);
    waypoints[waypointIndex * 2 + 1] = Math.round(point.y);
    result = { ...wire, waypoints };
  });
  return result;
}
