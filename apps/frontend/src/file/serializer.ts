import type { ModelDocument } from "../model/types";

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
}

function assertCoordinatePair(point: [number, number], label: string): void {
  assertInteger(point[0], `${label}[0]`);
  assertInteger(point[1], `${label}[1]`);
}

function assertSerializableDocument(document: ModelDocument): void {
  assertInteger(document.model.grid, "model.grid");
  for (const block of document.model.blocks) {
    assertCoordinatePair(block.position, `block ${block.id} position`);
  }
  for (const wire of document.model.wires) {
    for (const [index, waypoint] of wire.waypoints.entries()) {
      assertCoordinatePair(waypoint, `wire ${wire.id} waypoints[${index}]`);
    }
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

export function serialize(document: ModelDocument): string {
  assertSerializableDocument(document);
  return JSON.stringify(canonicalize(document));
}

export const serializeModel = serialize;

export default serialize;
