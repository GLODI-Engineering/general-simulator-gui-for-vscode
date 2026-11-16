import type { Model } from "../model/types";

/**
 * Search inside the open schematic, as opposed to `library/search.ts`, which
 * searches the component catalogue. The two are different questions: "which
 * component could I place" against "where is the thing already on my sheet".
 *
 * VS Code's own find does not answer the second one. The schematic is a custom
 * webview editor rather than a text document, so Ctrl+F never reaches into it
 * and the host cannot supply this.
 *
 * Ported from the retired Tauri app (`apps/frontend/src/search` there, FE-25b).
 * The scores keep that implementation's ranking — a parameter name beats a
 * block id, which beats a block type, which beats a wire — and extend it to the
 * schema-v2 fields it predated: `label` on blocks and wires, `net`, and
 * annotation text.
 */

export type SearchMatchKind = "block" | "param" | "wire" | "net" | "annotation";

export interface SearchMatch {
  /** Block, wire or annotation id — what the canvas should reveal. */
  id: string;
  kind: SearchMatchKind;
  score: number;
  /** What actually matched, so the list can say why a row is there. */
  detail: string;
}

/**
 * `lines` is optional so a caller holding only a graph slice can still search,
 * and so the ported tests need not construct annotations they do not exercise.
 */
export type SearchableModel = Pick<Model, "blocks" | "wires"> & Partial<Pick<Model, "lines">>;

export const PARAM_NAME_SCORE = 300;
export const BLOCK_ID_SCORE = 200;
export const BLOCK_LABEL_SCORE = 190;
export const BLOCK_TYPE_SCORE = 180;
export const IC_NAME_SCORE = 170;
export const NET_NAME_SCORE = 150;
export const WIRE_LABEL_SCORE = 120;
export const WIRE_ID_SCORE = 100;
export const ANNOTATION_TEXT_SCORE = 50;

export const MAX_RESULTS = 100;

export function findInModel(model: SearchableModel, query: string): SearchMatch[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  const hit = (haystack: string | null | undefined): boolean =>
    typeof haystack === "string" && haystack.toLowerCase().includes(needle);

  const matches: SearchMatch[] = [];
  const push = (id: string, kind: SearchMatchKind, score: number, detail: string): void => {
    matches.push({ id, kind, score, detail });
  };

  for (const block of model.blocks) {
    for (const paramName of Object.keys(block.params ?? {})) {
      if (hit(paramName)) {
        push(block.id, "param", PARAM_NAME_SCORE, paramName);
      }
    }
    for (const icName of Object.keys(block.ic ?? {})) {
      if (hit(icName)) {
        push(block.id, "param", IC_NAME_SCORE, `ic.${icName}`);
      }
    }
    if (hit(block.id)) {
      push(block.id, "block", BLOCK_ID_SCORE, block.id);
    }
    if (hit(block.label)) {
      push(block.id, "block", BLOCK_LABEL_SCORE, block.label as string);
    }
    if (hit(block.type)) {
      push(block.id, "block", BLOCK_TYPE_SCORE, block.type);
    }
  }

  for (const wire of model.wires) {
    if (hit(wire.net)) {
      push(wire.id, "net", NET_NAME_SCORE, wire.net as string);
    }
    if (hit(wire.label)) {
      push(wire.id, "wire", WIRE_LABEL_SCORE, wire.label as string);
    }
    if (hit(wire.id)) {
      push(wire.id, "wire", WIRE_ID_SCORE, wire.id);
    }
  }

  for (const annotation of model.lines ?? []) {
    if (hit(annotation.text)) {
      push(annotation.id, "annotation", ANNOTATION_TEXT_SCORE, annotation.text as string);
    }
  }

  // One row per thing-and-reason. Without this a block with two matching
  // parameters appeared twice under one key, which the old list rendered as
  // duplicate React children.
  const best = new Map<string, SearchMatch>();
  for (const match of matches) {
    const key = `${match.kind}:${match.id}:${match.detail}`;
    const seen = best.get(key);
    if (!seen || match.score > seen.score) {
      best.set(key, match);
    }
  }

  return [...best.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.id.localeCompare(right.id) ||
        left.detail.localeCompare(right.detail),
    )
    .slice(0, MAX_RESULTS);
}

export default findInModel;
