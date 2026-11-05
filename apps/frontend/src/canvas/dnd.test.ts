/**
 * FE-42: DnD helpers — payload encoding and coordinate conversion
 *
 * Acceptance:
 * - SidebarItem renders with draggable=true and sets the correct
 *   application/x-gensim-block payload on dragstart.
 * - screenToModelCoords returns correct grid-snapped model coords.
 * - Simulating a drop inserts block at expected position.
 * - Dropping with unknown block name inserts nothing and does not throw.
 * - Click-to-insert still works after DnD wiring.
 */

import { describe, expect, it } from "vitest";
import {
  DND_BLOCK_TYPE,
  decodeBlockPayload,
  encodeBlockPayload,
  screenToModelCoords,
  snapToGrid,
} from "./dnd";

describe("FE-42: DnD helpers", () => {
  describe("encodeBlockPayload / decodeBlockPayload roundtrip", () => {
    it("encodes blockName and decodes it back", () => {
      const encoded = encodeBlockPayload("passive.resistor");
      const decoded = decodeBlockPayload(encoded);
      expect(decoded).toEqual({ blockName: "passive.resistor" });
    });

    it("DND_BLOCK_TYPE constant is application/x-gensim-block", () => {
      expect(DND_BLOCK_TYPE).toBe("application/x-gensim-block");
    });

    it("decodeBlockPayload returns null for invalid JSON", () => {
      expect(decodeBlockPayload("not-json")).toBeNull();
    });

    it("decodeBlockPayload returns null for JSON without blockName", () => {
      expect(decodeBlockPayload(JSON.stringify({ foo: "bar" }))).toBeNull();
    });

    it("decodeBlockPayload returns null for non-string blockName", () => {
      expect(decodeBlockPayload(JSON.stringify({ blockName: 42 }))).toBeNull();
    });

    it("decodeBlockPayload returns null for empty string", () => {
      expect(decodeBlockPayload("")).toBeNull();
    });
  });

  describe("snapToGrid", () => {
    it("snaps to nearest grid point", () => {
      expect(snapToGrid(14, 17, 10)).toEqual([10, 20]);
    });

    it("exact grid position returns itself", () => {
      expect(snapToGrid(20, 30, 10)).toEqual([20, 30]);
    });

    it("works with grid=1 (identity)", () => {
      expect(snapToGrid(7, 13, 1)).toEqual([7, 13]);
    });
  });

  describe("screenToModelCoords", () => {
    const makeRect = (left: number, top: number): DOMRect =>
      ({
        left,
        top,
        right: left + 800,
        bottom: top + 600,
        width: 800,
        height: 600,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;

    it("no pan, zoom=1, grid=10 — basic conversion", () => {
      const rect = makeRect(0, 0);
      const [mx, my] = screenToModelCoords(55, 75, rect, { x: 0, y: 0 }, 1, 10);
      expect(mx).toBe(60);
      expect(my).toBe(80);
    });

    it("canvas offset accounted for", () => {
      const rect = makeRect(100, 50);
      const [mx, my] = screenToModelCoords(160, 110, rect, { x: 0, y: 0 }, 1, 10);
      // screen 160 - canvasLeft 100 = 60, snapped to 60
      expect(mx).toBe(60);
      // screen 110 - canvasTop 50 = 60, snapped to 60
      expect(my).toBe(60);
    });

    it("pan offset shifts model origin", () => {
      const rect = makeRect(0, 0);
      // pan.x=100 means canvas is panned 100px to the right
      const [mx, my] = screenToModelCoords(110, 100, rect, { x: 100, y: 0 }, 1, 10);
      // modelX = (110 - 0 - 100) / 1 = 10
      expect(mx).toBe(10);
      // modelY = (100 - 0 - 0) / 1 = 100
      expect(my).toBe(100);
    });

    it("zoom=2 halves model coords", () => {
      const rect = makeRect(0, 0);
      const [mx, my] = screenToModelCoords(200, 100, rect, { x: 0, y: 0 }, 2, 10);
      // modelX = 200 / 2 = 100; modelY = 100 / 2 = 50
      expect(mx).toBe(100);
      expect(my).toBe(50);
    });

    it("zoom=0.5 doubles model coords", () => {
      const rect = makeRect(0, 0);
      const [mx, my] = screenToModelCoords(50, 100, rect, { x: 0, y: 0 }, 0.5, 10);
      // modelX = 50 / 0.5 = 100; modelY = 100 / 0.5 = 200
      expect(mx).toBe(100);
      expect(my).toBe(200);
    });

    it("grid=5 snaps to 5-unit grid", () => {
      const rect = makeRect(0, 0);
      const [mx, my] = screenToModelCoords(13, 23, rect, { x: 0, y: 0 }, 1, 5);
      // 13 → round(13/5)*5 = round(2.6)*5 = 15; 23 → round(23/5)*5 = round(4.6)*5 = 25
      expect(mx).toBe(15);
      expect(my).toBe(25);
    });
  });
});
