/**
 * FE-59: Annotation tools — pure utilities for creating and snapping annotations.
 *
 * These functions return AnnotationData objects (with a `geometry` sub-object)
 * that can be converted to the model Annotation schema via toModelAnnotation().
 */

import type { Annotation } from "../../../../packages/schemas/generated/typescript";

// Counter for generating unique ids within a session.
let _idCounter = 0;

function generateId(kind: string): string {
  _idCounter += 1;
  return `${kind}-${Date.now()}-${_idCounter}`;
}

/** Snap a numeric value to the nearest grid multiple, returning an integer. */
export function snapToGrid(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

/** Snap a 2-D point to the grid. */
export function snapPoint(x: number, y: number, grid: number): [number, number] {
  return [snapToGrid(x, grid), snapToGrid(y, grid)];
}

export type AnnotationKind = "text" | "polyline" | "rectangle" | "ellipse";

export interface AnnotationGeometry {
  position?: [number, number];
  points?: Array<[number, number]>;
  size?: [number, number];
}

/** Intermediate representation used by the tools layer before persisting. */
export interface AnnotationData {
  id: string;
  kind: AnnotationKind;
  geometry: AnnotationGeometry;
  text?: string;
  style?: Record<string, unknown>;
}

// ─── Constructors ───────────────────────────────────────────────────────────

export function createText(pos: [number, number]): AnnotationData {
  return {
    id: generateId("text"),
    kind: "text",
    geometry: { position: [pos[0], pos[1]] },
    text: "",
    style: { color: "#000000", font_size: 18, bold: false, italic: false },
  };
}

export function createPolyline(points: Array<[number, number]>): AnnotationData {
  return {
    id: generateId("polyline"),
    kind: "polyline",
    geometry: { points: points.map(([x, y]): [number, number] => [x, y]) },
    style: {
      color: "#000000",
      stroke_width: 1,
      stroke_style: "solid",
      arrow_end: "none",
    },
  };
}

export function createRectangle(origin: [number, number], size: [number, number]): AnnotationData {
  return {
    id: generateId("rectangle"),
    kind: "rectangle",
    geometry: {
      position: [origin[0], origin[1]],
      size: [size[0], size[1]],
    },
    style: { color: "#000000", fill: "none", stroke_width: 1, stroke_style: "solid" },
  };
}

export function createEllipse(center: [number, number], radii: [number, number]): AnnotationData {
  return {
    id: generateId("ellipse"),
    kind: "ellipse",
    geometry: {
      position: [center[0], center[1]],
      size: [radii[0], radii[1]],
    },
    style: { color: "#000000", fill: "none", stroke_width: 1, stroke_style: "solid" },
  };
}

// ─── Conversion to model schema ──────────────────────────────────────────────

/** Convert AnnotationData to the schema-compatible Annotation stored in model.lines[]. */
export function toModelAnnotation(data: AnnotationData): Annotation {
  const ann: Annotation = {
    id: data.id,
    kind: data.kind,
  };
  if (data.geometry.position !== undefined) {
    ann.position = data.geometry.position;
  }
  if (data.geometry.size !== undefined) {
    ann.size = data.geometry.size;
  }
  if (data.geometry.points !== undefined) {
    ann.points = data.geometry.points;
  }
  if (data.text !== undefined) {
    ann.text = data.text;
  }
  if (data.style !== undefined) {
    ann.style = data.style as Record<
      string,
      import("../../../../packages/schemas/generated/typescript").ParamValue
    >;
  }
  return ann;
}

/** Convert a schema Annotation back into AnnotationData for editing. */
export function fromModelAnnotation(ann: Annotation): AnnotationData {
  const geometry: AnnotationGeometry = {};
  if (ann.position !== undefined) geometry.position = ann.position;
  if (ann.size !== undefined) geometry.size = ann.size;
  if (ann.points !== undefined) geometry.points = ann.points;

  return {
    id: ann.id,
    kind: ann.kind,
    geometry,
    text: ann.text,
    style: ann.style as Record<string, unknown> | undefined,
  };
}
