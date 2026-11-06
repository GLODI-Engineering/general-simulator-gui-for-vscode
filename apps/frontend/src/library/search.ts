import type { BlockMetadata } from "../model/types";

function fuzzyScore(candidate: string, query: string): number {
  if (query.length === 0) {
    return 0;
  }

  let score = 0;
  let queryIndex = 0;
  for (const char of candidate) {
    if (char === query[queryIndex]) {
      score += 1;
      queryIndex += 1;
      if (queryIndex === query.length) {
        break;
      }
    }
  }
  return queryIndex === query.length ? score : -1;
}

/**
 * Scores for a query that equals a candidate outright, by where the match
 * was found.
 *
 * All three beat any partial match plus the largest recency bonus (30 + 40),
 * so an exact match cannot be displaced by familiarity. They differ from
 * each other because a family's merged entry carries every variant's name
 * in its aliases: searching for "physical_electrical.reference.ground"
 * matched both that component *and* the "Ground" family it was collapsed
 * into, the two tied, and the tie broke alphabetically in favour of the
 * wrong one. Someone who typed a component's own name has named that
 * component, not something that lists it.
 */
export const EXACT_NAME_SCORE = 120;
export const EXACT_LABEL_SCORE = 110;
export const EXACT_ALIAS_SCORE = 100;

export interface SearchResult {
  entry: BlockMetadata;
  score: number;
}

export function searchCatalog(
  entries: BlockMetadata[],
  query: string,
  recent: string[],
): SearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();

  return entries
    .map((entry) => {
      const name = entry.name.toLowerCase();
      const label = entry.label.toLowerCase();
      const secondary = [...(entry.aliases ?? []), ...(entry.tags ?? [])].map((value) =>
        value.toLowerCase(),
      );
      const haystacks = [label, name, ...secondary];
      const recentIndex = recent.indexOf(entry.name);
      const recentBonus = recentIndex === -1 ? 0 : Math.max(40 - recentIndex * 4, 4);

      let textScore = 0;
      if (normalizedQuery.length === 0) {
        textScore = 1;
      } else if (name === normalizedQuery) {
        textScore = EXACT_NAME_SCORE;
      } else if (label === normalizedQuery) {
        textScore = EXACT_LABEL_SCORE;
      } else if (secondary.some((value) => value === normalizedQuery)) {
        textScore = EXACT_ALIAS_SCORE;
      } else if (haystacks.some((value) => value.startsWith(normalizedQuery))) {
        textScore = 30;
      } else if (haystacks.some((value) => value.includes(normalizedQuery))) {
        textScore = 20;
      } else {
        textScore = Math.max(...haystacks.map((value) => fuzzyScore(value, normalizedQuery)));
      }

      return {
        entry,
        score: textScore < 0 ? -1 : textScore + recentBonus,
      };
    })
    .filter((result) => result.score >= 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.entry.label.localeCompare(right.entry.label),
    );
}
