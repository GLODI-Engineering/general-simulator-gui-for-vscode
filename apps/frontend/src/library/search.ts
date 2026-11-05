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
      const haystacks = [
        entry.label,
        entry.name,
        ...(entry.aliases ?? []),
        ...(entry.tags ?? []),
      ].map((value) => value.toLowerCase());
      const recentIndex = recent.indexOf(entry.name);
      const recentBonus = recentIndex === -1 ? 0 : Math.max(40 - recentIndex * 4, 4);

      let textScore = 0;
      if (normalizedQuery.length === 0) {
        textScore = 1;
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
