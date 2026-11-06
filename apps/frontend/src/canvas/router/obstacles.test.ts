import { describe, expect, it } from "vitest";

import { PAD, type RouterComponent, compBBox, getObstacles } from "./obstacles";

const comp = (x: number, y: number, ports: Array<[number, number]>): RouterComponent => ({
  position: [x, y],
  size: { w: 120, h: 120 },
  rotation: 0,
  ports: ports.map(([px, py]) => ({ x: px, y: py })),
});

/**
 * `getObstacles` used to drop both components a wire connects to, so that a
 * wire was never blocked by the parts it joins. That let a wire run straight
 * across the body of the very component it was reaching -- visible on a
 * back-to-back switch pair, where the mirrored device had a wire through its
 * face. The exclusion is now only for an endpoint that genuinely sits inside
 * the box.
 */
describe("a component a wire connects to", () => {
  it("is still an obstacle when the endpoint is outside its box", () => {
    // A port's stub tip is a lead-length out from the body, well clear of the
    // few units of padding, so the wire can reach it from outside.
    const c = comp(0, 0, [[60, -20]]);
    expect(getObstacles([c], 60, -20, 400, 400)).toHaveLength(1);
  });

  it("is dropped when the endpoint really is inside its box", () => {
    // Here keeping the obstacle would make the port unreachable, which is the
    // case the exclusion was written for.
    const c = comp(0, 0, [[60, 60]]);
    expect(getObstacles([c], 60, 60, 400, 400)).toHaveLength(0);
  });

  it("pads the box it returns", () => {
    const c = comp(0, 0, [[60, -20]]);
    expect(getObstacles([c], 60, -20, 400, 400)[0]).toEqual(compBBox(c, PAD));
  });
});
